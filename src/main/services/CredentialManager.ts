import { app } from "electron";
import { join } from "path";
import { writeFile, readFile, mkdir, access } from "fs/promises";
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2 } from "crypto";
import { promisify } from "util";
import { AppConfig } from "@shared/config";

const pbkdf2Async = promisify(pbkdf2);

interface EncryptedCredential {
  providerId: string;
  encryptedApiKey: string;
  iv: string;
  salt: string;
  timestamp: number;
}

interface CredentialMetadata {
  providerId: string;
  hasApiKey: boolean;
  lastUpdated: number;
  keyHash: string; // Hash for verification without storing the actual key
}

export class CredentialManager {
  private readonly dataPath: string;
  private readonly credentialsFile: string;
  private readonly metadataFile: string;
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly saltLength = 32;
  private readonly iterations = 100000; // PBKDF2 iterations
  
  // Runtime cache for decrypted keys (cleared on app exit)
  private keyCache: Map<string, { key: string; expires: number }> = new Map();
  private readonly cacheTimeout = 300000; // 5 minutes

  constructor() {
    this.dataPath = join(app.getPath("userData"), "credentials");
    this.credentialsFile = join(this.dataPath, "credentials.enc");
    this.metadataFile = join(this.dataPath, "metadata.json");
    this.initializeDirectories();
  }

  private async initializeDirectories(): Promise<void> {
    try {
      await access(this.dataPath);
    } catch {
      await mkdir(this.dataPath, { recursive: true });
    }
  }

  private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return await pbkdf2Async(password, salt, this.iterations, this.keyLength, 'sha256');
  }

  private getMasterPassword(): string {
    // In production, this should come from a secure source
    // For now, use the configured key with app-specific data
    const appSpecific = app.getName() + app.getVersion();
    return AppConfig.storage.encryptionKey + appSpecific;
  }

  private async encryptApiKey(apiKey: string, providerId: string): Promise<EncryptedCredential> {
    const salt = randomBytes(this.saltLength);
    const iv = randomBytes(this.ivLength);
    const masterPassword = this.getMasterPassword();
    
    const key = await this.deriveKey(masterPassword + providerId, salt);
    const cipher = createCipheriv(this.algorithm, key, iv);
    
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    const encryptedWithTag = encrypted + authTag.toString('hex');

    return {
      providerId,
      encryptedApiKey: encryptedWithTag,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      timestamp: Date.now(),
    };
  }

  private async decryptApiKey(credential: EncryptedCredential): Promise<string> {
    const salt = Buffer.from(credential.salt, 'hex');
    const iv = Buffer.from(credential.iv, 'hex');
    const masterPassword = this.getMasterPassword();
    
    const key = await this.deriveKey(masterPassword + credential.providerId, salt);
    
    // Extract auth tag from the encrypted data
    const encryptedData = credential.encryptedApiKey;
    const authTag = Buffer.from(encryptedData.slice(-32), 'hex'); // Last 16 bytes as hex
    const encrypted = encryptedData.slice(0, -32);
    
    const decipher = createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  private createKeyHash(apiKey: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 16);
  }

  async storeApiKey(providerId: string, apiKey: string): Promise<void> {
    try {
      if (!apiKey || apiKey.trim().length === 0) {
        throw new Error('API key cannot be empty');
      }

      // Validate API key format (basic checks)
      this.validateApiKeyFormat(providerId, apiKey);

      const encryptedCredential = await this.encryptApiKey(apiKey, providerId);
      
      // Load existing credentials
      let credentials: EncryptedCredential[] = [];
      try {
        const data = await readFile(this.credentialsFile, 'utf-8');
        credentials = JSON.parse(data);
      } catch {
        // File doesn't exist or is empty, start with empty array
      }

      // Update or add the credential
      const existingIndex = credentials.findIndex(c => c.providerId === providerId);
      if (existingIndex >= 0) {
        credentials[existingIndex] = encryptedCredential;
      } else {
        credentials.push(encryptedCredential);
      }

      // Save encrypted credentials
      await writeFile(this.credentialsFile, JSON.stringify(credentials, null, 2));

      // Update metadata
      await this.updateMetadata(providerId, apiKey);

      // Clear cache for this provider to force re-encryption on next access
      this.keyCache.delete(providerId);

      console.log(`[CredentialManager] Stored API key for provider: ${providerId}`);
    } catch (error) {
      console.error(`[CredentialManager] Failed to store API key for ${providerId}:`, error);
      throw new Error(`Failed to store API key: ${(error as Error).message}`);
    }
  }

  async getApiKey(providerId: string): Promise<string | null> {
    try {
      // Check cache first
      const cached = this.keyCache.get(providerId);
      if (cached && cached.expires > Date.now()) {
        return cached.key;
      }

      // Load credentials from file
      let credentials: EncryptedCredential[] = [];
      try {
        const data = await readFile(this.credentialsFile, 'utf-8');
        credentials = JSON.parse(data);
      } catch {
        return null; // No credentials file exists
      }

      const credential = credentials.find(c => c.providerId === providerId);
      if (!credential) {
        return null;
      }

      const apiKey = await this.decryptApiKey(credential);

      // Cache the decrypted key temporarily
      this.keyCache.set(providerId, {
        key: apiKey,
        expires: Date.now() + this.cacheTimeout,
      });

      return apiKey;
    } catch (error) {
      console.error(`[CredentialManager] Failed to get API key for ${providerId}:`, error);
      return null;
    }
  }

  async deleteApiKey(providerId: string): Promise<void> {
    try {
      let credentials: EncryptedCredential[] = [];
      try {
        const data = await readFile(this.credentialsFile, 'utf-8');
        credentials = JSON.parse(data);
      } catch {
        return; // No credentials file exists
      }

      credentials = credentials.filter(c => c.providerId !== providerId);
      await writeFile(this.credentialsFile, JSON.stringify(credentials, null, 2));

      // Update metadata
      const metadata = await this.getCredentialMetadata();
      const filteredMetadata = metadata.filter(m => m.providerId !== providerId);
      await writeFile(this.metadataFile, JSON.stringify(filteredMetadata, null, 2));

      // Clear cache
      this.keyCache.delete(providerId);

      console.log(`[CredentialManager] Deleted API key for provider: ${providerId}`);
    } catch (error) {
      console.error(`[CredentialManager] Failed to delete API key for ${providerId}:`, error);
      throw error;
    }
  }

  async getCredentialMetadata(): Promise<CredentialMetadata[]> {
    try {
      const data = await readFile(this.metadataFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private async updateMetadata(providerId: string, apiKey: string): Promise<void> {
    const metadata = await this.getCredentialMetadata();
    const existingIndex = metadata.findIndex(m => m.providerId === providerId);

    const credentialMetadata: CredentialMetadata = {
      providerId,
      hasApiKey: true,
      lastUpdated: Date.now(),
      keyHash: this.createKeyHash(apiKey),
    };

    if (existingIndex >= 0) {
      metadata[existingIndex] = credentialMetadata;
    } else {
      metadata.push(credentialMetadata);
    }

    await writeFile(this.metadataFile, JSON.stringify(metadata, null, 2));
  }

  private validateApiKeyFormat(providerId: string, apiKey: string): void {
    const validationRules = {
      openai: /^sk-[A-Za-z0-9]{48,}$/,
      anthropic: /^sk-ant-[A-Za-z0-9\-_]{40,}$/,
      gemini: /^[A-Za-z0-9\-_]{39}$/,
      deepseek: /^sk-[A-Za-z0-9]{48,}$/,
      qwen: /^sk-[A-Za-z0-9]{20,}$/,
    };

    const rule = validationRules[providerId as keyof typeof validationRules];
    if (rule && !rule.test(apiKey)) {
      throw new Error(`Invalid API key format for ${providerId}`);
    }
  }

  // Security utilities
  async rotateEncryption(): Promise<void> {
    // Re-encrypt all stored keys with new salt/IV
    try {
      const credentials = await this.loadAllCredentials();
      const newCredentials: EncryptedCredential[] = [];

      for (const credential of credentials) {
        const decryptedKey = await this.decryptApiKey(credential);
        const reEncrypted = await this.encryptApiKey(decryptedKey, credential.providerId);
        newCredentials.push(reEncrypted);
      }

      await writeFile(this.credentialsFile, JSON.stringify(newCredentials, null, 2));
      this.clearCache();

      console.log('[CredentialManager] Encryption rotation completed');
    } catch (error) {
      console.error('[CredentialManager] Failed to rotate encryption:', error);
      throw error;
    }
  }

  private async loadAllCredentials(): Promise<EncryptedCredential[]> {
    try {
      const data = await readFile(this.credentialsFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  clearCache(): void {
    this.keyCache.clear();
    console.log('[CredentialManager] Key cache cleared');
  }

  // Clean up expired cache entries
  cleanupCache(): void {
    const now = Date.now();
    for (const [providerId, cached] of this.keyCache.entries()) {
      if (cached.expires <= now) {
        this.keyCache.delete(providerId);
      }
    }
  }

  // Verify integrity of stored credentials
  async verifyIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    let valid = true;

    try {
      const credentials = await this.loadAllCredentials();
      const metadata = await this.getCredentialMetadata();

      // Check if all credentials can be decrypted
      for (const credential of credentials) {
        try {
          await this.decryptApiKey(credential);
        } catch (error) {
          valid = false;
          errors.push(`Failed to decrypt credential for ${credential.providerId}`);
        }
      }

      // Check metadata consistency
      for (const meta of metadata) {
        const hasCredential = credentials.some(c => c.providerId === meta.providerId);
        if (meta.hasApiKey && !hasCredential) {
          valid = false;
          errors.push(`Metadata indicates API key exists for ${meta.providerId} but no credential found`);
        }
      }

    } catch (error) {
      valid = false;
      errors.push(`Failed to verify integrity: ${(error as Error).message}`);
    }

    return { valid, errors };
  }
}

export const credentialManager = new CredentialManager();

// Clean up cache periodically
setInterval(() => {
  credentialManager.cleanupCache();
}, 60000); // Every minute