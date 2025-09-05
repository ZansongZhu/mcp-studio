import { app } from "electron";
import { join } from "path";
import { writeFile, readFile, mkdir, access } from "fs/promises";
import { AppConfig } from "@shared/config";

interface ConversationSnapshot {
  id: string;
  title: string;
  messages: any[];
  createdAt: number;
  updatedAt: number;
  modelId: string;
  mcpServerIds: string[];
  archived: boolean;
}

interface ConversationMetadata {
  id: string;
  title: string;
  messageCount: number;
  lastMessage?: string;
  createdAt: number;
  updatedAt: number;
  modelId: string;
  mcpServerIds: string[];
}

export class ConversationPersistence {
  private readonly dataPath: string;
  private readonly conversationsPath: string;
  private readonly metadataPath: string;

  constructor() {
    this.dataPath = join(app.getPath("userData"), "conversations");
    this.conversationsPath = join(this.dataPath, "conversations");
    this.metadataPath = join(this.dataPath, "metadata.json");
    this.initializeDirectories();
  }

  private async initializeDirectories(): Promise<void> {
    try {
      await access(this.dataPath);
    } catch {
      await mkdir(this.dataPath, { recursive: true });
    }

    try {
      await access(this.conversationsPath);
    } catch {
      await mkdir(this.conversationsPath, { recursive: true });
    }
  }

  async saveConversation(conversation: any): Promise<void> {
    const snapshot: ConversationSnapshot = {
      id: conversation.id,
      title: conversation.title,
      messages: conversation.messages || [],
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      modelId: conversation.modelId,
      mcpServerIds: conversation.mcpServerIds || [],
      archived: false,
    };

    // Save full conversation data
    const conversationFile = join(this.conversationsPath, `${conversation.id}.json`);
    await writeFile(conversationFile, JSON.stringify(snapshot, null, 2));

    // Update metadata
    await this.updateMetadata(conversation);

    console.log(`[ConversationPersistence] Saved conversation: ${conversation.id}`);
  }

  async loadConversation(conversationId: string): Promise<ConversationSnapshot | null> {
    try {
      const conversationFile = join(this.conversationsPath, `${conversationId}.json`);
      const data = await readFile(conversationFile, "utf-8");
      const conversation = JSON.parse(data) as ConversationSnapshot;
      
      console.log(`[ConversationPersistence] Loaded conversation: ${conversationId}`);
      return conversation;
    } catch (error) {
      console.error(`[ConversationPersistence] Failed to load conversation ${conversationId}:`, error);
      return null;
    }
  }

  async getConversationMetadata(): Promise<ConversationMetadata[]> {
    try {
      const data = await readFile(this.metadataPath, "utf-8");
      const metadata = JSON.parse(data) as ConversationMetadata[];
      return metadata;
    } catch (error) {
      console.log("[ConversationPersistence] No metadata found, returning empty array");
      return [];
    }
  }

  private async updateMetadata(conversation: any): Promise<void> {
    const metadata = await this.getConversationMetadata();
    const existingIndex = metadata.findIndex(m => m.id === conversation.id);

    const conversationMetadata: ConversationMetadata = {
      id: conversation.id,
      title: conversation.title,
      messageCount: conversation.messages?.length || 0,
      lastMessage: conversation.messages?.length > 0 
        ? conversation.messages[conversation.messages.length - 1].content.substring(0, 100) + "..."
        : undefined,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      modelId: conversation.modelId,
      mcpServerIds: conversation.mcpServerIds || [],
    };

    if (existingIndex >= 0) {
      metadata[existingIndex] = conversationMetadata;
    } else {
      metadata.unshift(conversationMetadata); // Add to beginning for chronological order
    }

    // Keep only recent conversations in metadata
    const maxConversations = AppConfig.ui.maxConversationsInMemory;
    if (metadata.length > maxConversations * 2) {
      // Archive older conversations
      const toArchive = metadata.splice(maxConversations);
      await this.archiveConversations(toArchive);
    }

    await writeFile(this.metadataPath, JSON.stringify(metadata, null, 2));
  }

  private async archiveConversations(conversations: ConversationMetadata[]): Promise<void> {
    for (const conv of conversations) {
      try {
        const snapshot = await this.loadConversation(conv.id);
        if (snapshot) {
          snapshot.archived = true;
          const conversationFile = join(this.conversationsPath, `${conv.id}.json`);
          await writeFile(conversationFile, JSON.stringify(snapshot, null, 2));
          console.log(`[ConversationPersistence] Archived conversation: ${conv.id}`);
        }
      } catch (error) {
        console.error(`[ConversationPersistence] Failed to archive conversation ${conv.id}:`, error);
      }
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    try {
      const conversationFile = join(this.conversationsPath, `${conversationId}.json`);
      const fs = require("fs");
      fs.unlinkSync(conversationFile);

      // Update metadata
      const metadata = await this.getConversationMetadata();
      const filteredMetadata = metadata.filter(m => m.id !== conversationId);
      await writeFile(this.metadataPath, JSON.stringify(filteredMetadata, null, 2));

      console.log(`[ConversationPersistence] Deleted conversation: ${conversationId}`);
    } catch (error) {
      console.error(`[ConversationPersistence] Failed to delete conversation ${conversationId}:`, error);
    }
  }

  // Prune old messages from a conversation while keeping the conversation
  async pruneConversationMessages(conversationId: string, maxMessages: number = AppConfig.ai.maxHistoryMessages): Promise<void> {
    try {
      const snapshot = await this.loadConversation(conversationId);
      if (!snapshot) return;

      if (snapshot.messages.length <= maxMessages) return;

      // Keep most recent messages
      const prunedMessages = snapshot.messages.slice(-maxMessages);
      snapshot.messages = prunedMessages;
      snapshot.updatedAt = Date.now();

      // Save the pruned conversation
      const conversationFile = join(this.conversationsPath, `${conversationId}.json`);
      await writeFile(conversationFile, JSON.stringify(snapshot, null, 2));

      console.log(`[ConversationPersistence] Pruned conversation ${conversationId}: ${snapshot.messages.length}/${maxMessages} messages kept`);
    } catch (error) {
      console.error(`[ConversationPersistence] Failed to prune conversation ${conversationId}:`, error);
    }
  }

  async getStorageStats(): Promise<{ conversationCount: number; totalMessages: number; totalSize: number }> {
    try {
      const metadata = await this.getConversationMetadata();
      const totalMessages = metadata.reduce((sum, conv) => sum + conv.messageCount, 0);
      
      // Calculate approximate storage size
      const fs = require("fs");
      let totalSize = 0;
      
      for (const conv of metadata) {
        try {
          const conversationFile = join(this.conversationsPath, `${conv.id}.json`);
          const stats = fs.statSync(conversationFile);
          totalSize += stats.size;
        } catch {
          // Ignore missing files
        }
      }

      return {
        conversationCount: metadata.length,
        totalMessages,
        totalSize,
      };
    } catch (error) {
      console.error("[ConversationPersistence] Failed to get storage stats:", error);
      return { conversationCount: 0, totalMessages: 0, totalSize: 0 };
    }
  }
}

export const conversationPersistence = new ConversationPersistence();