import { BaseProvider } from "./BaseProvider";
import { ModelProvider, AIProviderResponse } from "@shared/types";
import mcpService from "../services/MCPService";
import { toolProcessor } from "../services/ToolProcessor";

export class GeminiProvider extends BaseProvider {
  constructor(provider?: ModelProvider) {
    super(provider, 'gemini');
  }

  async generateResponse(
    messages: any[],
    model: string,
    maxTokens?: number
  ): Promise<string> {
    this.logProviderCall('gemini', model, messages?.length);
    console.log(
      `⚠️ [GEMINI] WARNING: Using basic generateResponse - tools will NOT be processed!`
    );
    
    this.validateProvider();

    const { GoogleGenAI } = require("@google/genai");
    const genAI = new GoogleGenAI({ apiKey: this.provider?.apiKey });

    return await this.withRetry(async () => {
      // Convert messages to Gemini format
      const systemMessage = messages.find((m) => m.role === "system");
      const conversationMessages = messages.filter((m) => m.role !== "system");

      // Build the contents array for Gemini
      const contents: any[] = [];

      // Add system message as user message if exists
      if (systemMessage) {
        contents.push({
          role: "user",
          parts: [{ text: systemMessage.content }],
        });
      }

      // Add conversation messages
      conversationMessages.forEach((msg) => {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      });

      const result = await genAI.models.generateContent({
        model,
        contents,
        generationConfig: {
          maxOutputTokens: maxTokens || 8192,
          temperature: 0.7,
        },
      });

      const response = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      this.logProviderSuccess('gemini', model, response.length);
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
      `🔴🛠️ [GEMINI TOOLS] Starting NATIVE TOOL call to ${model} with ${tools.length} tools`
    );
    console.log(
      `✅ [GEMINI TOOLS] This method WILL process tool_code blocks automatically`
    );

    this.validateProvider();

    const { GoogleGenAI } = require("@google/genai");
    const genAI = new GoogleGenAI({ apiKey: this.provider?.apiKey });

    try {
      return await this.withRetry(async () => {
        // Convert MCP tools to Gemini format - flatten function declarations
        const functionDeclarations = tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema || { type: "object", properties: {} },
        }));

        const geminiTools = [
          {
            functionDeclarations: functionDeclarations,
          },
        ];

        console.log(`🔧 [GEMINI] Prepared ${geminiTools.length} tools`);

        // Convert messages to Gemini format
        const systemMessage = messages.find((m) => m.role === "system");
        const conversationMessages = messages.filter((m) => m.role !== "system");

        // Build the contents array for Gemini
        const contents: any[] = [];

        // Add system message as user message if exists
        if (systemMessage) {
          contents.push({
            role: "user",
            parts: [{ text: systemMessage.content }],
          });
        }

        // Add conversation messages
        conversationMessages.forEach((msg) => {
          contents.push({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }],
          });
        });

        const result = await genAI.models.generateContent({
          model,
          contents,
          tools: functionDeclarations.length > 0 ? geminiTools : undefined,
          toolConfig: {
            functionCallingConfig: {
              mode: "AUTO",
            },
          },
          generationConfig: {
            maxOutputTokens: maxTokens || 8192,
            temperature: 0.7,
          },
        });

        // Handle tool calls
        const executedToolCalls: any[] = [];
        let finalResponse = "";

        const candidate = result.candidates?.[0];
        if (!candidate) {
          return { success: false, error: "No response from Gemini" };
        }

        console.log(
          `🔍 [GEMINI TOOLS] Processing ${candidate.content?.parts?.length || 0} content parts`
        );

        for (const part of candidate.content?.parts || []) {
          if (part.text) {
            console.log(
              `🔍 [GEMINI TOOLS] Found text part: ${part.text.substring(0, 100)}...`
            );
            finalResponse += part.text;
          } else if (part.functionCall) {
            console.log(
              `🔍 [GEMINI TOOLS] Found structured functionCall: ${part.functionCall.name}`
            );
            try {
              console.log(`⚙️ [GEMINI] Calling tool: ${part.functionCall.name}`);

              // Find the matching tool and server
              const tool = tools.find((t) => t.name === part.functionCall.name);
              const server = tool
                ? servers.find((s) => s.id === tool.serverId)
                : null;

              if (tool && server) {
                const toolResult = await mcpService.callTool(null, {
                  server,
                  name: part.functionCall.name,
                  args: part.functionCall.args || {},
                });

                executedToolCalls.push({
                  id: `gemini-${Date.now()}-${Math.random()}`,
                  name: part.functionCall.name,
                  args: part.functionCall.args || {},
                  result: toolResult,
                  serverId: server.id,
                  serverName: server.name,
                });

                console.log(
                  `✅ [GEMINI] Tool executed: ${part.functionCall.name}`
                );
              } else {
                // Handle missing tool/server gracefully
                const errorMsg = !tool 
                  ? `Tool '${part.functionCall.name}' not found in available tools`
                  : `Server for tool '${part.functionCall.name}' not found or not active`;
                
                console.warn(`⚠️ [GEMINI] ${errorMsg}`);
                
                executedToolCalls.push({
                  id: `gemini-${Date.now()}-${Math.random()}`,
                  name: part.functionCall.name,
                  args: part.functionCall.args || {},
                  error: errorMsg,
                });
                
                // Add error message to response instead of failing silently
                finalResponse += `\n\n*Note: ${errorMsg}. Available tools: ${tools.map(t => t.name).join(', ')}*`;
              }
            } catch (error) {
              console.error(`❌ [GEMINI] Tool execution failed:`, error);
              executedToolCalls.push({
                id: `gemini-${Date.now()}-${Math.random()}`,
                name: part.functionCall.name,
                error: (error as Error).message,
              });
            }
          }
        }

        // If we have tool calls, make a follow-up request with results
        if (executedToolCalls.length > 0) {
          const followUpContents = [
            ...contents,
            {
              role: "model",
              parts: candidate.content?.parts || [],
            },
            {
              role: "user",
              parts: executedToolCalls.map((call) => ({
                functionResponse: {
                  name: call.name,
                  response: call.result ? call.result : { error: call.error },
                },
              })),
            },
          ];

          const followUpResult = await genAI.models.generateContent({
            model,
            contents: followUpContents,
            generationConfig: {
              maxOutputTokens: maxTokens || 8192,
              temperature: 0.7,
            },
          });

          const followUpText =
            followUpResult.candidates?.[0]?.content?.parts?.find(
              (p: any) => p.text
            )?.text;
          if (followUpText) {
            finalResponse = followUpText;
          }
        }

        // Check for tool_code processing need - use the shared ToolProcessor
        const hasToolCode = finalResponse.includes("<tool_code>");
        const hasToolCall = finalResponse.includes("<tool_call>");
        const shouldProcessToolCode =
          executedToolCalls.length === 0 && (hasToolCode || hasToolCall);

        if (shouldProcessToolCode) {
          console.log(
            `⚠️ [GEMINI TOOLS] No structured function calls found, but found tool blocks. Processing with ToolProcessor...`
          );
          
          const { processedResponse, toolCalls } = await toolProcessor.processToolCalls(
            finalResponse,
            servers
          );
          
          finalResponse = processedResponse;
          executedToolCalls.push(...toolCalls);
        }

        console.log(
          `✅ [GEMINI TOOLS] FINAL SUCCESS with ${executedToolCalls.length} tool calls`
        );

        return {
          success: true,
          response: finalResponse,
          toolCalls: executedToolCalls,
        };
      });
    } catch (error) {
      this.logProviderError('gemini', model, error as Error);
      return {
        success: false,
        error: `Gemini API error: ${(error as any).message}`,
      };
    }
  }
}