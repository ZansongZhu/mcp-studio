import { ModelProvider, MCPServer, AIProvider, AIProviderResponse } from "@shared/types";
import { ProviderFactory } from "../providers";
import { toolProcessor } from "./ToolProcessor";
import mcpService from "./MCPService";
import { AppConfig } from "@shared/config";
import { logger } from "@shared/monitoring";

export class AIService {
  private clients: Map<string, AIProvider> = new Map();
  private providers: ModelProvider[] = [];
  private activeServers: MCPServer[] = [];

  constructor(providers: ModelProvider[] = []) {
    console.log(`[AIService] Constructor called with providers:`, providers.length);
    this.providers = providers;
    this.initializeClients();
  }

  setActiveServers(servers: MCPServer[]): void {
    this.activeServers = servers;
  }

  private initializeClients(): void {
    logger.info(
      `[AIService] Initializing clients for ${this.providers.length} providers`
    );
    this.clients.clear();

    for (const provider of this.providers) {
      console.log(
        `[AIService] Initializing client for provider: ${provider.id}, hasApiKey: ${!!provider.apiKey}`
      );
      if (provider.apiKey) {
        console.log(`[AIService] API key for ${provider.id}: ${provider.apiKey.substring(0, 8)}...`);
      }

      try {
        const client = ProviderFactory.create(provider.id, provider);
        this.clients.set(provider.id, client);
        console.log(`[AIService] Client initialized for: ${provider.id}`);
      } catch (error) {
        console.warn(`[AIService] Failed to initialize provider ${provider.id}:`, error);
      }
    }

    console.log(`[AIService] Total clients initialized: ${this.clients.size}`);
  }

  async generateResponse(
    providerId: string,
    model: string,
    messages: any[],
    maxTokens?: number
  ): Promise<string> {
    console.log(
      `🤖 [AI CALL] Provider: ${providerId} | Model: ${model} | Messages: ${messages?.length}`
    );

    const client = this.clients.get(providerId);
    if (!client) {
      console.error(
        `❌ [AIService] No client configured for provider: ${providerId}`
      );
      console.error(
        `[AIService] Available providers:`,
        Array.from(this.clients.keys())
      );
      throw new Error(`No client configured for provider: ${providerId}`);
    }

    console.log(`✅ [AIService] Using ${providerId} client for model: ${model}`);

    try {
      const response = await client.generateResponse(messages, model, maxTokens);
      console.log(
        `✨ [AI RESPONSE] Provider: ${providerId} | Model: ${model} | Length: ${response?.length} chars`
      );
      return response;
    } catch (error) {
      console.error(
        `❌ [AI ERROR] Provider: ${providerId} | Model: ${model} |`,
        error
      );
      throw error;
    }
  }

  async generateResponseWithTools(
    providerId: string,
    model: string,
    messages: any[],
    maxTokens?: number,
    serverIds?: string[]
  ): Promise<AIProviderResponse> {
    console.log(
      `🛠️ [AI CALL WITH TOOLS] Provider: ${providerId} | Model: ${model} | Messages: ${messages?.length} | MCP Servers: ${serverIds?.length || 0}`
    );

    const client = this.clients.get(providerId);
    if (!client) {
      console.error(`❌ [AIService] No client for provider: ${providerId}`);
      return {
        success: false,
        error: `No client configured for provider: ${providerId}`,
      };
    }

    // Filter active servers if serverIds are provided
    const relevantServers = serverIds
      ? this.activeServers.filter((s) => serverIds.includes(s.id) && s.isActive)
      : this.activeServers.filter((s) => s.isActive);

    // If no active servers, just return the normal response
    if (relevantServers.length === 0) {
      try {
        const response = await client.generateResponse(messages, model, maxTokens);
        return { success: true, response };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }

    try {
      // Get available tools from MCP servers
      const availableTools = await this.getAvailableTools(relevantServers);
      console.log(`🔧 [TOOLS] Found ${availableTools.length} available tools`);

      // Use the client's native tool calling if supported
      const hasNativeTools = typeof client.generateResponseWithTools === "function";
      console.log(
        `🔍 [AIService] Provider: ${providerId}, Has native tools: ${hasNativeTools}`
      );

      if (hasNativeTools && client.generateResponseWithTools) {
        console.log(`🔧 [AIService] Using native tool calling for ${providerId}`);
        return await client.generateResponseWithTools(
          messages,
          model,
          maxTokens,
          availableTools,
          relevantServers
        );
      } else {
        console.log(
          `⚠️ [AIService] No native tool calling for ${providerId}, falling back to XML parsing`
        );

        // Fallback to the XML-based approach using ToolProcessor
        const response = await client.generateResponse(messages, model, maxTokens);
        const { processedResponse, toolCalls } = await toolProcessor.processToolCalls(
          response,
          relevantServers
        );

        return {
          success: true,
          response: processedResponse,
          toolCalls,
        };
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private async getAvailableTools(servers: MCPServer[]): Promise<any[]> {
    const tools: any[] = [];

    for (const server of servers) {
      try {
        const serverTools = await mcpService.listTools(null, server);
        for (const tool of serverTools) {
          tools.push({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            serverId: server.id,
            serverName: server.name,
          });
        }
      } catch (error) {
        console.error(`Failed to get tools from server ${server.name}:`, error);
      }
    }

    return tools;
  }

  updateProviders(providers: ModelProvider[]): void {
    this.providers = providers;

    // Update existing clients with new provider info
    for (const provider of providers) {
      const client = this.clients.get(provider.id);
      if (client) {
        client.setProvider(provider);
      }
    }

    // Initialize any new clients
    this.initializeClients();
  }

  // Utility method to validate conversation history length
  static pruneConversationHistory(messages: any[]): any[] {
    const maxHistoryTokens = AppConfig.ai.maxHistoryMessages;
    const maxHistoryChars = AppConfig.ai.maxHistoryChars;

    if (messages.length <= maxHistoryTokens) {
      return messages;
    }

    let conversationMessages: typeof messages = [];
    let totalChars = 0;

    // Add messages from newest to oldest until we hit the limit
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const messageChars = message.content.length;

      if (
        totalChars + messageChars > maxHistoryChars &&
        conversationMessages.length > 0
      ) {
        break;
      }

      conversationMessages.unshift(message);
      totalChars += messageChars;

      if (conversationMessages.length >= maxHistoryTokens) {
        break;
      }
    }

    console.log(
      `📝 [CONTEXT] Using ${conversationMessages.length}/${messages.length} messages (${totalChars} chars, ~${Math.ceil(totalChars / 4)} tokens)`
    );

    return conversationMessages;
  }
}

export default new AIService([]);