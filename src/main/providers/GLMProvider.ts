import { BaseProvider } from "./BaseProvider";
import { ModelProvider, AIProviderResponse } from "@shared/types";
import mcpService from "../services/MCPService";
import { toolProcessor } from "../services/ToolProcessor";

export class GLMProvider extends BaseProvider {
  constructor(provider?: ModelProvider) {
    super(provider, 'glm');
  }

  async generateResponse(
    messages: any[],
    model: string,
    maxTokens?: number
  ): Promise<string> {
    this.logProviderCall('glm', model, messages?.length);
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
      this.logProviderSuccess('glm', model, response.length);
      return response;
    });
  }

  /**
   * GLM/Zhipu's function-calling validator returns an opaque 500 ("网络错误")
   * when a tool's JSON Schema has a *property named* like a reserved schema
   * keyword — most notably `$ref`. GLM intercepts the key as a schema
   * reference even though here it is a legitimate field name, and crashes.
   * (Real `$ref`/`$defs`/`additionalProperties` used as schema keywords are
   * fine — only $-prefixed reserved names used as PROPERTY KEYS break it.)
   *
   * We recursively drop such property keys (and any matching `required`
   * entries). The dropped fields are rare, deeply-nested optionals, so the
   * tool stays usable; the alternative is the whole request failing with 500.
   */
  private static readonly RESERVED_PROP_NAMES = new Set([
    "$ref",
    "$schema",
    "$id",
    "$defs",
    "$comment",
  ]);

  private sanitizeSchema(schema: any): any {
    if (Array.isArray(schema)) {
      return schema.map((item) => this.sanitizeSchema(item));
    }
    if (!schema || typeof schema !== "object") {
      return schema;
    }

    const out: any = {};
    for (const [key, value] of Object.entries(schema)) {
      if (key === "properties" && value && typeof value === "object") {
        const props: any = {};
        for (const [propName, propSchema] of Object.entries(value)) {
          if (GLMProvider.RESERVED_PROP_NAMES.has(propName)) {
            console.warn(
              `⚠️ [GLM] Dropping tool property "${propName}" — GLM's schema parser rejects $-prefixed property names`
            );
            continue;
          }
          props[propName] = this.sanitizeSchema(propSchema);
        }
        out.properties = props;
      } else if (key === "required" && Array.isArray(value)) {
        out.required = value.filter(
          (r) => !GLMProvider.RESERVED_PROP_NAMES.has(r)
        );
      } else if (value && typeof value === "object") {
        // Recurse into items, nested schemas, combinators, $defs, etc.
        out[key] = this.sanitizeSchema(value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  /** Build a GLM-safe function `parameters` object from an MCP inputSchema. */
  private toGlmParameters(inputSchema: any): any {
    const sanitized = this.sanitizeSchema(inputSchema) || {};
    if (sanitized.type !== "object") {
      sanitized.type = "object";
    }
    if (!sanitized.properties || typeof sanitized.properties !== "object") {
      sanitized.properties = {};
    }
    return sanitized;
  }

  async generateResponseWithTools(
    messages: any[],
    model: string,
    maxTokens: number | undefined,
    tools: any[],
    servers: any[]
  ): Promise<AIProviderResponse> {
    console.log(
      `🔵🛠️ [GLM TOOLS] Starting call to ${model} with ${tools.length} tools`
    );

    this.validateProvider();

    const OpenAI = require("openai");
    const client = new OpenAI(this.getBaseConfig());

    try {
      return await this.withRetry(async () => {
        // Convert MCP tools to OpenAI function format, sanitizing each schema
        // so GLM's stricter validator doesn't 500 on unsupported keywords.
        const functions = tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: this.toGlmParameters(tool.inputSchema),
          },
        }));

        console.log(`🔧 [GLM] Prepared ${functions.length} functions`);

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
          return { success: false, error: "No response from GLM" };
        }

        // Handle tool calls
        const executedToolCalls: any[] = [];
        let finalResponse = message.content || "";

        if (message.tool_calls && message.tool_calls.length > 0) {
          console.log(
            `🔨 [GLM] Executing ${message.tool_calls.length} tool calls`
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
                console.log(`⚙️ [GLM] Calling tool: ${toolName}`);
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

                console.log(`✅ [GLM] Tool executed: ${toolName}`);
              }
            } catch (error) {
              console.error(`❌ [GLM] Tool execution failed:`, error);
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

          const followUpCompletion = await client.chat.completions.create({
            model,
            messages: toolResultMessages,
            max_tokens: maxTokens,
            temperature: 0.7,
          });

          const followUpResponse = followUpCompletion.choices[0]?.message?.content;
          finalResponse = followUpResponse || finalResponse;
        } else if (finalResponse.includes("<tool_call>")) {
          // GLM often emits tool calls as textual <tool_call> XML (following
          // the app's system-prompt format) instead of native tool_calls.
          // Parse and execute those, then summarize so the user sees a
          // formatted answer rather than the raw tool payload.
          console.log(`🔨 [GLM] Detected textual <tool_call> emission, parsing via ToolProcessor`);

          const { toolCalls } = await toolProcessor.processToolCalls(
            finalResponse,
            servers
          );

          if (toolCalls.length > 0) {
            executedToolCalls.push(...toolCalls);

            const toolResultsText = toolCalls
              .map((call) =>
                call.result
                  ? `Tool ${call.name} result:\n${JSON.stringify(call.result)}`
                  : `Tool ${call.name} error: ${(call as any).error || "unknown error"}`
              )
              .join("\n\n");

            const toolResultMessages = [
              ...messages,
              { role: "assistant", content: finalResponse },
              {
                role: "user",
                content: `Here are the tool results:\n\n${toolResultsText}\n\nUsing only this data, present a clear, formatted answer to the original request. Do not emit any <tool_call> tags.`,
              },
            ];

            const followUpCompletion = await client.chat.completions.create({
              model,
              messages: toolResultMessages,
              max_tokens: maxTokens,
              temperature: 0.7,
            });

            finalResponse =
              followUpCompletion.choices[0]?.message?.content || finalResponse;
          }
        }

        console.log(
          `✅ [GLM TOOLS] Success with ${executedToolCalls.length} tool calls`
        );
        return {
          success: true,
          response: finalResponse,
          toolCalls: executedToolCalls,
        };
      });
    } catch (error) {
      this.logProviderError('glm', model, error as Error);
      return {
        success: false,
        error: `GLM API error: ${(error as any).message}`,
      };
    }
  }
}
