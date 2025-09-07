import { BaseProvider } from "./BaseProvider";
import { ModelProvider, AIProviderResponse } from "@shared/types";
import mcpService from "../services/MCPService";
import { logger } from "@shared/monitoring";

export class OllamaProvider extends BaseProvider {
  constructor(provider?: ModelProvider) {
    super(provider, "openai"); // Use openai config as fallback for timeout/retry settings
  }

  async generateResponse(
    messages: any[],
    _model: string,
    maxTokens?: number
  ): Promise<string> {
    // Always use the provider's default model for Ollama
    const actualModel = this.provider?.defaultModel || 'ollama';
    
    console.log(`[OllamaProvider] DEBUG: Provider config:`, {
      providerId: this.provider?.id,
      providerName: this.provider?.name,
      defaultModel: this.provider?.defaultModel,
      baseUrl: this.provider?.baseUrl,
      actualModelToUse: actualModel
    });
    
    this.logProviderCall("ollama", actualModel, messages.length);

    const baseUrl = this.provider?.baseUrl || "http://localhost:11434";
    
    try {
      const response = await this.withRetry(async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: actualModel,
            messages: messages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            stream: false,
            options: {
              num_predict: maxTokens || 2048,
            }
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Ollama API error: ${response.status} - ${error}`);
        }

        return response.json();
      });

      const content = response.message?.content || "";
      this.logProviderSuccess("ollama", actualModel, content.length);
      return content;
    } catch (error) {
      this.logProviderError("ollama", actualModel, error as Error);
      throw error;
    }
  }

  async generateResponseWithTools(
    messages: any[],
    model: string,
    maxTokens: number | undefined,
    tools: any[],
    servers: any[]
  ): Promise<AIProviderResponse> {
    logger.info(
      `🔴🛠️ [OLLAMA TOOLS] Starting NATIVE TOOL call to ${model} with ${tools.length} tools`
    );
    
    this.validateProvider();
    
    const actualModel = this.provider?.defaultModel || model;
    const baseUrl = this.provider?.baseUrl || "http://localhost:11434";
    
    try {
      return await this.withRetry(async () => {
        // Convert MCP tools to Ollama format
        const ollamaTools = tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || "No description available",
            parameters: tool.inputSchema || { type: "object", properties: {} }
          }
        }));

        console.log(`🔧 [OLLAMA] Prepared ${ollamaTools.length} tools`);

        // Initial request with tools
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: actualModel,
            messages: messages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            tools: ollamaTools,
            stream: false,
            options: {
              num_predict: maxTokens || 2048,
            }
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Ollama API error: ${response.status} - ${error}`);
        }

        const result = await response.json();
        const executedToolCalls: any[] = [];
        let finalResponse = result.message?.content || "";
        
        // Handle tool calls if present
        if (result.message?.tool_calls) {
          console.log(
            `🔍 [OLLAMA TOOLS] Processing ${result.message.tool_calls.length} tool calls`
          );
          
          const messagesWithToolCalls = [
            ...messages,
            result.message
          ];

          // Execute each tool call
          for (const toolCall of result.message.tool_calls) {
            console.log(`⚙️ [OLLAMA] Calling tool: ${toolCall.function.name}`);
            
            try {
              // Find the matching tool and server
              const tool = tools.find((t) => t.name === toolCall.function.name);
              const server = tool ? servers.find((s) => s.id === tool.serverId) : null;

              if (tool && server) {
                const toolResult = await mcpService.callTool(null, {
                  server,
                  name: toolCall.function.name,
                  args: toolCall.function.arguments || {},
                });

                executedToolCalls.push({
                  id: toolCall.id || `ollama-${Date.now()}-${Math.random()}`,
                  name: toolCall.function.name,
                  args: toolCall.function.arguments || {},
                  result: toolResult,
                  serverId: server.id,
                  serverName: server.name,
                });

                // Add tool response to messages
                messagesWithToolCalls.push({
                  role: 'tool',
                  content: JSON.stringify(toolResult)
                });

                console.log(`✅ [OLLAMA] Tool executed: ${toolCall.function.name}`);
              } else {
                const errorMsg = `Tool '${toolCall.function.name}' or its server not found`;
                console.error(`❌ [OLLAMA] ${errorMsg}`);
                
                executedToolCalls.push({
                  id: toolCall.id || `ollama-${Date.now()}-${Math.random()}`,
                  name: toolCall.function.name,
                  error: errorMsg,
                });

                messagesWithToolCalls.push({
                  role: 'tool',
                  content: JSON.stringify({ error: errorMsg })
                });
              }
            } catch (error) {
              console.error(`❌ [OLLAMA] Tool execution failed:`, error);
              const errorMsg = (error as Error).message;
              
              executedToolCalls.push({
                id: toolCall.id || `ollama-${Date.now()}-${Math.random()}`,
                name: toolCall.function.name,
                error: errorMsg,
              });

              messagesWithToolCalls.push({
                role: 'tool',
                content: JSON.stringify({ error: errorMsg })
              });
            }
          }

          // Get final response from model with tool outputs
          if (executedToolCalls.length > 0) {
            const followUpResponse = await fetch(`${baseUrl}/api/chat`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: actualModel,
                messages: messagesWithToolCalls.map(msg => ({
                  role: msg.role,
                  content: msg.content
                })),
                stream: false,
                options: {
                  num_predict: maxTokens || 2048,
                }
              }),
            });

            if (followUpResponse.ok) {
              const followUpResult = await followUpResponse.json();
              finalResponse = followUpResult.message?.content || finalResponse;
            }
          }
        }

        console.log(
          `✅ [OLLAMA TOOLS] FINAL SUCCESS with ${executedToolCalls.length} tool calls`
        );

        return {
          success: true,
          response: finalResponse,
          toolCalls: executedToolCalls,
        };
      });
    } catch (error) {
      this.logProviderError("ollama", actualModel, error as Error);
      return {
        success: false,
        error: `Ollama API error: ${(error as any).message}`,
      };
    }
  }
}