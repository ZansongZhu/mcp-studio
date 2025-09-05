import Store from "electron-store";
import { ModelProvider, MCPServer } from "@shared/types";
import { app } from "electron";
import { join, resolve } from "path";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";

interface StorageSchema {
  modelProviders: ModelProvider[];
  activeModelId?: string;
  mcpServers: MCPServer[];
  promptTemplates: any[];
}

interface ExternalConfig {
  modelProviders: ModelProvider[];
  activeModelId?: string;
  mcpServers: MCPServer[];
  promptTemplates: any[];
}

export class StorageService {
  private store: Store<StorageSchema>;
  private externalConfigPath: string;

  constructor() {
    this.store = new Store<StorageSchema>({
      defaults: {
        modelProviders: [],
        activeModelId: undefined,
        mcpServers: [],
        promptTemplates: [],
      },
      name: "mcp-studio-config",
    });
    
    // Path to external config file - Windows-safe approach
    if (process.platform === "win32") {
      // Windows: Use home directory directly to avoid path traversal issues
      this.externalConfigPath = join(homedir(), "mcp-studio", "mcp-studio-config.json");
    } else {
      // Unix-like systems: Use traditional approach
      this.externalConfigPath = join(app.getPath("userData"), "..", "mcp-studio", "mcp-studio-config.json");
    }
    
    console.log(`[StorageService] External config path: ${this.externalConfigPath}`);
  }

  private readExternalConfig(): ExternalConfig | null {
    try {
      if (existsSync(this.externalConfigPath)) {
        console.log(`[StorageService] Reading external config from: ${this.externalConfigPath}`);
        const configContent = readFileSync(this.externalConfigPath, 'utf8');
        return JSON.parse(configContent);
      } else {
        console.log(`[StorageService] External config not found at: ${this.externalConfigPath}`);
      }
    } catch (error) {
      console.error(`[StorageService] Failed to read external config from ${this.externalConfigPath}:`, error);
      // Windows debugging: Show additional path information
      if (process.platform === "win32") {
        console.error(`[Windows] Home directory: ${homedir()}`);
        console.error(`[Windows] UserData path: ${app.getPath("userData")}`);
      }
    }
    return null;
  }

  getModelProviders(): ModelProvider[] {
    // First try external config
    const externalConfig = this.readExternalConfig();
    if (externalConfig?.modelProviders && externalConfig.modelProviders.length > 0) {
      console.log('[StorageService] Loading providers from external config with API keys');
      //console.log(externalConfig.modelProviders);
      return externalConfig.modelProviders;
    }
    
    // Fall back to electron-store
    console.log('[StorageService] Loading providers from electron-store');
    return this.store.get("modelProviders", []);
  }

  setModelProviders(providers: ModelProvider[]): void {
    this.store.set("modelProviders", providers);
  }

  getActiveModelId(): string | undefined {
    // First try external config
    const externalConfig = this.readExternalConfig();
    if (externalConfig?.activeModelId) {
      return externalConfig.activeModelId;
    }
    
    // Fall back to electron-store
    return this.store.get("activeModelId");
  }

  setActiveModelId(modelId: string): void {
    this.store.set("activeModelId", modelId);
  }

  getMCPServers(): MCPServer[] {
    // First try external config
    const externalConfig = this.readExternalConfig();
    if (externalConfig?.mcpServers && externalConfig.mcpServers.length > 0) {
      return externalConfig.mcpServers;
    }
    
    // Fall back to electron-store
    return this.store.get("mcpServers", []);
  }

  setMCPServers(servers: MCPServer[]): void {
    this.store.set("mcpServers", servers);
  }

  getPromptTemplates(): any[] {
    // First try external config
    const externalConfig = this.readExternalConfig();
    if (externalConfig?.promptTemplates && externalConfig.promptTemplates.length > 0) {
      return externalConfig.promptTemplates;
    }
    
    // Fall back to electron-store
    return this.store.get("promptTemplates", []);
  }

  setPromptTemplates(templates: any[]): void {
    this.store.set("promptTemplates", templates);
  }

  clearAll(): void {
    this.store.clear();
  }
}

// Singleton instance
export const storageService = new StorageService();
