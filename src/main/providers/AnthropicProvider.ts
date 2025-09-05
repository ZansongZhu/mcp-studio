import { BaseProvider } from "./BaseProvider";
import { ModelProvider, AIProviderResponse } from "@shared/types";
import mcpService from "../services/MCPService";

export class AnthropicProvider extends BaseProvider {
  constructor(provider?: ModelProvider) {
    super(provider, 'anthropic');
  }

  async generateResponse(
    messages: any[],
    model: string,
    maxTokens?: number
  ): Promise<string> {
    this.logProviderCall('anthropic', model, messages?.length);
    this.validateProvider();

    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic(this.getBaseConfig());

    return await this.withRetry(async () => {
      // Convert messages format for Anthropic
      const systemMessage = messages.find((m) => m.role === "system");
      const conversationMessages = messages.filter((m) => m.role !== "system");

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens || 8192,
        system: systemMessage?.content || undefined,
        messages: conversationMessages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
        temperature: 0.7,
      });

      const result = response.content[0]?.text || "";
      this.logProviderSuccess('anthropic', model, result.length);
      return result;
    });
  }

  async generateResponseWithTools(
    messages: any[],
    model: string,
    maxTokens: number | undefined,
    tools: any[],
    servers: any[]
  ): Promise<AIProviderResponse> {
    console.log(
      `🟠🛠️ [ANTHROPIC TOOLS] Starting call to ${model} with ${tools.length} tools`
    );

    this.validateProvider();

    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic(this.getBaseConfig());

    try {
      return await this.withRetry(async () => {
        // Convert MCP tools to Anthropic format
        const anthropicTools = tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema || { type: "object", properties: {} },
        }));

        console.log(`🔧 [ANTHROPIC] Prepared ${anthropicTools.length} tools`);

        // Convert messages format for Anthropic
        const systemMessage = messages.find((m) => m.role === "system");
        const conversationMessages = messages.filter((m) => m.role !== "system");

        const response = await client.messages.create({
          model,
          max_tokens: maxTokens || 8192,
          system: systemMessage?.content || undefined,
          messages: conversationMessages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
          tools: anthropicTools,
          temperature: 0.7,
        });

        // Handle tool calls
        const executedToolCalls: any[] = [];
        let finalResponse = "";

        for (const content of response.content) {
          if (content.type === "text") {
            finalResponse += content.text;
          } else if (content.type === "tool_use") {
            try {
              console.log(`⚙️ [ANTHROPIC] Calling tool: ${content.name}`);

              // Find the matching tool and server
              const tool = tools.find((t) => t.name === content.name);
              const server = tool
                ? servers.find((s) => s.id === tool.serverId)
                : null;

              if (tool && server) {
                const toolResult = await mcpService.callTool(null, {
                  server,
                  name: content.name,
                  args: content.input,
                });

                executedToolCalls.push({
                  id: content.id,
                  name: content.name,
                  args: content.input,
                  result: toolResult,
                  serverId: server.id,
                  serverName: server.name,
                });

                console.log(`✅ [ANTHROPIC] Tool executed: ${content.name}`);
              }
            } catch (error) {
              console.error(`❌ [ANTHROPIC] Tool execution failed:`, error);
              executedToolCalls.push({
                id: content.id,
                name: content.name,
                error: (error as Error).message,
              });
            }
          }
        }

        // If we have tool calls, make a follow-up request with results
        if (executedToolCalls.length > 0) {
          const followUpMessages = [
            ...conversationMessages.map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            })),
            {
              role: "assistant",
              content: response.content,
            },
            {
              role: "user",
              content: executedToolCalls.map((call) => ({
                type: "tool_result",
                tool_use_id: call.id,
                content: call.result
                  ? JSON.stringify(call.result)
                  : `Error: ${call.error}`,
              })),
            },
          ];

          const followUpResponse = await client.messages.create({
            model,
            max_tokens: maxTokens || 8192,
            system: systemMessage?.content || undefined,
            messages: followUpMessages,
            temperature: 0.7,
          });

          finalResponse = followUpResponse.content[0]?.text || finalResponse;
        }

        console.log(
          `✅ [ANTHROPIC TOOLS] Success with ${executedToolCalls.length} tool calls`
        );
        return {
          success: true,
          response: finalResponse,
          toolCalls: executedToolCalls,
        };
      });
    } catch (error) {
      this.logProviderError('anthropic', model, error as Error);
      return {
        success: false,
        error: `Anthropic API error: ${(error as any).message}`,
      };
    }
  }
}