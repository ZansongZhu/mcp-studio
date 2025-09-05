import { BaseProvider } from "./BaseProvider";
import { ModelProvider, AIProviderResponse } from "@shared/types";
import mcpService from "../services/MCPService";

export class OpenAIProvider extends BaseProvider {
  constructor(provider?: ModelProvider) {
    super(provider, 'openai');
  }

  async generateResponse(
    messages: any[],
    model: string,
    maxTokens?: number
  ): Promise<string> {
    this.logProviderCall('openai', model, messages?.length);
    this.validateProvider();

    const OpenAI = require("openai");
    const client = new OpenAI(this.getBaseConfig());

    try {
      return await this.withRetry(async () => {
        // Use max_completion_tokens for GPT-5 models, max_tokens for others
        // GPT-5 only supports default temperature (1), not 0.7
        const isGPT5 = model.includes('gpt-5');
        const tokenParam = isGPT5 ? 'max_completion_tokens' : 'max_tokens';
        const requestBody: any = {
          model,
          messages,
        };
        
        // Only set temperature for non-GPT-5 models
        if (!isGPT5) {
          requestBody.temperature = 0.7;
        }
        
        if (maxTokens) {
          requestBody[tokenParam] = maxTokens;
        }

        const completion = await client.chat.completions.create(requestBody);

        const response = completion.choices[0]?.message?.content || "";
        this.logProviderSuccess('openai', model, response.length);
        return response;
      });
    } catch (error) {
      this.logProviderError('openai', model, error as Error);
      // Return the error as the response content so it appears in the chat
      const errorMessage = `❌ OpenAI Error: ${(error as any).message}`;
      console.log(`🔴 [OPENAI] Returning error as response: ${errorMessage}`);
      return errorMessage;
    }
  }

  async generateResponseWithTools(
    messages: any[],
    model: string,
    maxTokens: number | undefined,
    tools: any[],
    servers: any[]
  ): Promise<AIProviderResponse> {
    console.log(
      `🔵🛠️ [OPENAI TOOLS] Starting call to ${model} with ${tools.length} tools`
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

        console.log(`🔧 [OPENAI] Prepared ${functions.length} functions`);

        // Use max_completion_tokens for GPT-5 models, max_tokens for others
        // GPT-5 only supports default temperature (1), not 0.7
        const isGPT5 = model.includes('gpt-5');
        const tokenParam = isGPT5 ? 'max_completion_tokens' : 'max_tokens';
        const requestBody: any = {
          model,
          messages,
          tools: functions,
          tool_choice: "auto",
        };
        
        // Only set temperature for non-GPT-5 models
        if (!isGPT5) {
          requestBody.temperature = 0.7;
        }
        
        if (maxTokens) {
          requestBody[tokenParam] = maxTokens;
        }

        const completion = await client.chat.completions.create(requestBody);

        const choice = completion.choices[0];
        const message = choice?.message;

        if (!message) {
          return { success: false, error: "No response from OpenAI" };
        }

        // Handle tool calls
        const executedToolCalls: any[] = [];
        let finalResponse = message.content || "";

        if (message.tool_calls && message.tool_calls.length > 0) {
          console.log(
            `🔨 [OPENAI] Executing ${message.tool_calls.length} tool calls`
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
                console.log(`⚙️ [OPENAI] Calling tool: ${toolName}`);
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

                console.log(`✅ [OPENAI] Tool executed: ${toolName}`);
              }
            } catch (error) {
              console.error(`❌ [OPENAI] Tool execution failed:`, error);
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

          // Use max_completion_tokens for GPT-5 models, max_tokens for others
          // GPT-5 only supports default temperature (1), not 0.7
          const isGPT5 = model.includes('gpt-5');
          const tokenParam = isGPT5 ? 'max_completion_tokens' : 'max_tokens';
          const followUpRequestBody: any = {
            model,
            messages: toolResultMessages,
          };
          
          // Only set temperature for non-GPT-5 models
          if (!isGPT5) {
            followUpRequestBody.temperature = 0.7;
          }
          
          if (maxTokens) {
            followUpRequestBody[tokenParam] = maxTokens;
          }

          const followUpCompletion = await client.chat.completions.create(followUpRequestBody);

          finalResponse =
            followUpCompletion.choices[0]?.message?.content || finalResponse;
        }

        console.log(
          `✅ [OPENAI TOOLS] Success with ${executedToolCalls.length} tool calls`
        );
        return {
          success: true,
          response: finalResponse,
          toolCalls: executedToolCalls,
        };
      });
    } catch (error) {
      this.logProviderError('openai', model, error as Error);
      // Return the error as the response content so it appears in the chat
      const errorMessage = `❌ OpenAI Error: ${(error as any).message}`;
      console.log(`🔴 [OPENAI] Returning error as response: ${errorMessage}`);
      return {
        success: true,
        response: errorMessage,
        toolCalls: [],
      };
    }
  }
}