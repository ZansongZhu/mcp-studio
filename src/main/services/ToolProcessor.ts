import { MCPServer, ProcessedToolResponse, ToolCall } from "@shared/types";
import mcpService from "./MCPService";

export class ToolProcessor {
  async processToolCalls(
    response: string,
    relevantServers: MCPServer[]
  ): Promise<ProcessedToolResponse> {
    // Support both <tool_call> and <tool_code> formats
    const toolCallRegex = /<tool_call>(.*?)<\/tool_call>/gs;
    const toolCodeRegex = /<tool_code>([\s\S]*?)<\/tool_code>/gs;

    const toolCallMatches = response.match(toolCallRegex) || [];
    const toolCodeMatches = response.match(toolCodeRegex) || [];

    const toolCalls: ToolCall[] = [];
    let processedResponse = response;

    // Process <tool_call> format (JSON-based)
    if (toolCallMatches.length > 0) {
      for (const match of toolCallMatches) {
        try {
          const result = await this.processJsonToolCall(match, relevantServers);
          if (result.toolCall) {
            toolCalls.push(result.toolCall);
          }
          processedResponse = processedResponse.replace(match, result.replacement);
        } catch (error) {
          console.error("Error processing tool call:", error);
          const errorText = `<tool_error>${(error as Error).message}</tool_error>`;
          processedResponse = processedResponse.replace(match, errorText);
        }
      }
    }

    // Process <tool_code> format (code-based)
    if (toolCodeMatches.length > 0) {
      for (const match of toolCodeMatches) {
        try {
          const result = await this.processCodeToolCall(match, relevantServers);
          if (result.toolCall) {
            toolCalls.push(result.toolCall);
          }
          processedResponse = processedResponse.replace(match, result.replacement);
        } catch (error) {
          console.error("Error processing tool code:", error);
          const errorText = `<tool_error>${(error as Error).message}</tool_error>`;
          processedResponse = processedResponse.replace(match, errorText);
        }
      }
    }

    return { processedResponse, toolCalls };
  }

  private async processJsonToolCall(
    match: string,
    relevantServers: MCPServer[]
  ): Promise<{ toolCall?: ToolCall; replacement: string }> {
    const toolData = match.replace(/<tool_call>|<\/tool_call>/g, "").trim();
    console.log(`🔍 [TOOL_CALL_DEBUG] Raw tool data: ${toolData}`);

    let parsedData: any;
    try {
      // Try direct parsing first
      parsedData = JSON.parse(toolData);
    } catch (directError) {
      // Try to find JSON within the text
      const jsonMatch = toolData.match(/\{.*\}/s);
      if (jsonMatch) {
        console.log(`🔍 [TOOL_CALL_DEBUG] Extracted JSON: ${jsonMatch[0]}`);
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(
          `No valid JSON found in tool call data: ${toolData.substring(0, 100)}...`
        );
      }
    }

    const { serverId, name, args } = parsedData;

    // Find the server
    const server = relevantServers.find((s) => s.id === serverId);
    if (!server) {
      throw new Error(`Server '${serverId}' not found`);
    }

    // Execute the tool
    console.log(`🚀 [TOOL_PROCESSOR] Executing tool: ${name} on server: ${serverId}`);
    const toolResult = await mcpService.callTool(null, {
      server,
      name,
      args,
    });
    console.log(`✅ [TOOL_PROCESSOR] Tool executed successfully:`, {
      name,
      serverId,
      hasResult: !!toolResult,
      resultType: typeof toolResult,
      resultPreview: JSON.stringify(toolResult).substring(0, 200)
    });

    const toolCall: ToolCall = {
      id: `tool-${Date.now()}-${Math.random()}`,
      serverId,
      serverName: server.name,
      name,
      args,
      result: toolResult,
    };

    const replacement = `<tool_result>${JSON.stringify(toolResult, null, 2)}</tool_result>`;
    console.log(`🔄 [TOOL_PROCESSOR] Replacing tool call with result:`, {
      toolCallLength: name.length,
      replacementLength: replacement.length,
      replacementPreview: replacement.substring(0, 200)
    });

    return { toolCall, replacement };
  }

  private async processCodeToolCall(
    match: string,
    relevantServers: MCPServer[]
  ): Promise<{ toolCall?: ToolCall; replacement: string }> {
    const codeContent = match.replace(/<tool_code>|<\/tool_code>/g, "").trim();
    console.log(`🔍 [TOOL_CODE_DEBUG] Raw code: ${codeContent}`);

    // Parse Python-like function calls - handle print() wrapper
    let functionsToProcess: RegExpExecArray[] = [];

    // First, check if it's wrapped in print()
    const printMatch = codeContent.match(/print\((.+)\)/);
    if (printMatch) {
      // Extract the inner function call
      const innerCall = printMatch[1];
      const functionCallRegex = /(\w+)\(([^)]*)\)/g;
      const matches = Array.from(innerCall.matchAll(functionCallRegex));
      functionsToProcess = matches;
      console.log(`📊 [TOOL_CODE] Found print() wrapper, extracted: ${innerCall}`);
    } else {
      // Direct function call
      const functionCallRegex = /(\w+)\(([^)]*)\)/g;
      functionsToProcess = Array.from(codeContent.matchAll(functionCallRegex));
    }

    const functionMatches = functionsToProcess;
    console.log(`🔍 [TOOL_CODE] Found ${functionMatches.length} function calls in code`);

    for (const functionMatch of functionMatches) {
      const functionName = functionMatch[1];
      const argsString = functionMatch[2];

      // Parse function arguments (enhanced Python arg parsing)
      const args = this.parseFunctionArgs(argsString);

      console.log(
        `🔍 [TOOL_CODE_DEBUG] Parsed function: ${functionName}, args:`,
        JSON.stringify(args, null, 2)
      );

      // Find matching server and tool
      for (const server of relevantServers) {
        try {
          const serverTools = await mcpService.listTools(null, server);
          const tool = serverTools.find((t) => t.name === functionName);

          if (tool) {
            console.log(`⚙️ [TOOL_CODE] Executing: ${functionName} on ${server.name}`);

            const toolResult = await mcpService.callTool(null, {
              server,
              name: functionName,
              args,
            });

            const toolCall: ToolCall = {
              id: `tool-code-${Date.now()}-${Math.random()}`,
              serverId: server.id,
              serverName: server.name,
              name: functionName,
              args,
              result: toolResult,
            };

            const replacement = `<tool_result>${JSON.stringify(toolResult, null, 2)}</tool_result>`;

            console.log(`✅ [TOOL_CODE] Tool executed: ${functionName}`);
            return { toolCall, replacement };
          }
        } catch (serverError) {
          console.error(`Failed to check tools for server ${server.name}:`, serverError);
        }
      }
    }

    // If no tool was executed
    throw new Error(`Tool not found in any active server`);
  }

  private parseFunctionArgs(argsString: string): any {
    const args: any = {};

    // Handle both keyword and positional arguments
    const argPairs = argsString.split(",");
    for (const argPair of argPairs) {
      const trimmedPair = argPair.trim();

      if (trimmedPair.includes("=")) {
        // Keyword argument: symbol='LSEG.L'
        const [key, ...valueParts] = trimmedPair.split("=");
        const value = valueParts.join("=");
        if (key && value) {
          const cleanKey = key.trim();
          let cleanValue = value.trim().replace(/^['"`]|['"`]$/g, ""); // Remove surrounding quotes
          args[cleanKey] = cleanValue;
        }
      } else if (trimmedPair) {
        // Positional argument - for now, assume it's the first parameter
        const cleanValue = trimmedPair.replace(/^['"`]|['"`]$/g, "");
        // This is a simplified approach - in a real implementation you'd need the function signature
        args["symbol"] = cleanValue; // Assuming first param is symbol for this tool
      }
    }

    return args;
  }
}

export const toolProcessor = new ToolProcessor();