import { BaseProvider } from "./BaseProvider";
import { ModelProvider, AIProviderResponse } from "@shared/types";
import mcpService from "../services/MCPService";

export class DeepSeekProvider extends BaseProvider {
  constructor(provider?: ModelProvider) {
    super(provider, 'deepseek');
  }

  async generateResponse(
    messages: any[],
    model: string,
    maxTokens?: number
  ): Promise<string> {
    this.logProviderCall('deepseek', model, messages?.length);
    this.validateProvider();

    const OpenAI = require("openai");
    const client = new OpenAI(this.getBaseConfig());

    return await this.withRetry(async () => {
      const completion = await client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content || "";
      this.logProviderSuccess('deepseek', model, response.length);
      return response;
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
      `🟢🛠️ [DEEPSEEK TOOLS] Starting call to ${model} with ${tools.length} tools`
    );

    this.validateProvider();

    const OpenAI = require("openai");
    const client = new OpenAI(this.getBaseConfig());

    try {
      return await this.withRetry(async () => {
        // Convert MCP tools to OpenAI function format
        const functions = tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema || { type: "object", properties: {} },
          },
        }));

        console.log(`🔧 [DEEPSEEK] Prepared ${functions.length} functions`);

        const completion = await client.chat.completions.create({
          model,
          messages,
          max_tokens: maxTokens,
          temperature: 0.7,
          tools: functions,
          tool_choice: "auto",
        });

        const choice = completion.choices[0];
        const message = choice?.message;

        if (!message) {
          return { success: false, error: "No response from DeepSeek" };
        }

        // Handle tool calls
        const executedToolCalls: any[] = [];
        let finalResponse = message.content || "";

        if (message.tool_calls && message.tool_calls.length > 0) {
          console.log(
            `🔨 [DEEPSEEK] Executing ${message.tool_calls.length} tool calls`
          );

          for (const toolCall of message.tool_calls) {
            try {
              const toolName = toolCall.function.name;
              const toolArgs = JSON.parse(toolCall.function.arguments);

              // Find the matching tool and server
              const tool = tools.find((t) => t.name === toolName);
              const server = tool
                ? servers.find((s) => s.id === tool.serverId)
                : null;

              if (tool && server) {
                console.log(`⚙️ [DEEPSEEK] Calling tool: ${toolName}`);
                const toolResult = await mcpService.callTool(null, {
                  server,
                  name: toolName,
                  args: toolArgs,
                });

                executedToolCalls.push({
                  id: toolCall.id,
                  name: toolName,
                  args: toolArgs,
                  result: toolResult,
                  serverId: server.id,
                  serverName: server.name,
                });

                console.log(`✅ [DEEPSEEK] Tool executed: ${toolName}`);
              }
            } catch (error) {
              console.error(`❌ [DEEPSEEK] Tool execution failed:`, error);
              executedToolCalls.push({
                id: toolCall.id,
                name: toolCall.function.name,
                error: (error as Error).message,
              });
            }
          }

          // Generate follow-up response with tool results
          const toolResultMessages = [
            ...messages,
            message,
            ...executedToolCalls.map((call) => ({
              role: "tool",
              tool_call_id: call.id,
              content: call.result
                ? JSON.stringify(call.result)
                : `Error: ${call.error}`,
            })),
          ];

          console.log(`📝 [DEEPSEEK_DEBUG] Making follow-up call with tool results:`, {
            originalMessageLength: messages.length,
            toolResultsCount: executedToolCalls.length,
            hasToolResults: executedToolCalls.some(call => call.result)
          });

          const followUpCompletion = await client.chat.completions.create({
            model,
            messages: toolResultMessages,
            max_tokens: maxTokens,
            temperature: 0.7,
          });

          const followUpResponse = followUpCompletion.choices[0]?.message?.content;
          console.log(`📋 [DEEPSEEK_DEBUG] Follow-up response:`, {
            hasFollowUp: !!followUpResponse,
            followUpLength: followUpResponse?.length,
            originalResponse: finalResponse.substring(0, 100),
            followUpPreview: followUpResponse?.substring(0, 100)
          });

          finalResponse = followUpResponse || finalResponse;
        }

        console.log(
          `✅ [DEEPSEEK TOOLS] Success with ${executedToolCalls.length} tool calls`
        );
        return {
          success: true,
          response: finalResponse,
          toolCalls: executedToolCalls,
        };
      });
    } catch (error) {
      this.logProviderError('deepseek', model, error as Error);
      return {
        success: false,
        error: `DeepSeek API error: ${(error as any).message}`,
      };
    }
  }
}