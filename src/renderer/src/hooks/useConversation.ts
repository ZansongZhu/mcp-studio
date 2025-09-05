import { useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { message } from "antd";
import { RootState } from "../store";
import {
  createConversation,
  addMessage,
  setConversationGenerating,
  addToolCall,
  updateConversationMcpServers,
  updateConversationModel,
  setActiveConversation,
  selectAllConversations,
  selectActiveConversation
} from "../store/assistantSlice";
import { AppConfig } from "@shared/config";

const pruneConversationHistory = (messages: any[]): any[] => {
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

  return conversationMessages;
};

export const useConversation = () => {
  const dispatch = useDispatch();
  const conversations = useSelector(selectAllConversations);
  const activeConversation = useSelector(selectActiveConversation);
  const { providers, activeModelId, defaultModels } = useSelector(
    (state: RootState) => state.model
  );
  const { servers } = useSelector((state: RootState) => state.mcp);
  const allMessages = useSelector((state: RootState) => state.assistant.messages.entities);

  const availableModels = providers.flatMap((p) => p.models);

  const getConversationMessages = useCallback((conversationId: string) => {
    if (!allMessages) return [];
    
    return Object.values(allMessages)
      .filter(message => message?.conversationId === conversationId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [allMessages]);

  const handleNewConversation = useCallback(() => {
    const defaultModelId = activeModelId || availableModels[0]?.id;
    if (!defaultModelId) {
      message.error(
        "No models available. Please configure a model provider first."
      );
      return;
    }

    const title = `New Chat ${conversations.length + 1}`;
    // Use active MCP servers for new conversation
    const activeServerIds = servers.filter((s) => s.isActive).map((s) => s.id);
    dispatch(
      createConversation({
        title,
        modelId: defaultModelId,
        mcpServerIds: activeServerIds,
      })
    );
  }, [activeModelId, availableModels, conversations.length, servers, dispatch]);

  const handleSendMessage = useCallback(async (messageContent: string) => {
    if (!messageContent.trim()) return;
    
    let currentConversation = activeConversation;
    if (!currentConversation) {
      handleNewConversation();
      // After creating conversation, it will become the active conversation
      // We need to return here and wait for the next call
      return;
    }

    const conversationModelId = currentConversation.modelId;

    // Handle /tools command
    if (messageContent.trim() === "/tools") {
      const toolsCommandMessage = {
        role: "user" as const,
        content: messageContent,
        modelId: conversationModelId,
      };

      dispatch(
        addMessage({
          conversationId: currentConversation.id,
          message: toolsCommandMessage,
        })
      );

      return { isToolsCommand: true };
    }

    // Define the user message
    const userMessage = {
      role: "user" as const,
      content: messageContent,
      modelId: conversationModelId,
    };

    dispatch(
      addMessage({
        conversationId: currentConversation.id,
        message: userMessage,
      })
    );

    dispatch(
      setConversationGenerating({
        conversationId: currentConversation.id,
        isGenerating: true,
      })
    );

    try {
      // Get the conversation model and provider
      let conversationModel = defaultModels.find(
        (m) => m.id === conversationModelId
      );
      
      if (!conversationModel) {
        throw new Error("Conversation model not found");
      }

      // Get conversation history for context - use actual messages from the conversation
      const conversationHistory = getConversationMessages(currentConversation.id);
      const conversationMessages = pruneConversationHistory(conversationHistory);

      // Add system instructions if we have active servers
      const activeServerIds = currentConversation.mcpServerIds.filter(
        (serverId) => servers.find((s) => s.id === serverId)?.isActive
      );

      let systemMessage = {
        role: "system" as const,
        content:
          "You are a helpful assistant. Use tools directly when needed without asking for permission. When you call a tool, ALWAYS interpret and present the returned data in a clear, formatted response. Never show raw tool calls or ask the user to execute them - the tools execute automatically and you should analyze the results. Present financial data in tables, format numbers clearly, and provide meaningful insights from the data. Be concise and execute tools immediately when appropriate data is requested.",
      };

      if (activeServerIds.length > 0) {
        // Get available tools for active servers
        const availableToolsPromises = activeServerIds.map(async (serverId) => {
          try {
            const server = servers.find((s) => s.id === serverId);
            if (server) {
              return await window.api.mcp.listTools(server);
            }
            return [];
          } catch (error) {
            console.error(
              `Failed to fetch tools for server ${serverId}:`,
              error
            );
            return [];
          }
        });

        const allTools = await Promise.all(availableToolsPromises);
        const flattenedTools = allTools.flat();

        if (flattenedTools.length > 0) {
          const toolsDescription = flattenedTools
            .map(
              (tool) =>
                `Tool: ${tool.name}\nDescription: ${tool.description || "No description available"}\nParameters: ${JSON.stringify(tool.inputSchema || {})}\n`
            )
            .join("\n");

          systemMessage = {
            role: "system" as const,
            content: `You are a helpful assistant with access to the following tools:\n\n${toolsDescription}\n\nWhen you need to use a tool, format your response like this:\n\n<tool_call>{"serverId": "SERVER_ID", "name": "TOOL_NAME", "args": {...}}</tool_call>\n\nReplace SERVER_ID with the ID of the appropriate server, TOOL_NAME with the name of the tool, and provide the necessary arguments in the args object. The tool will be executed automatically, and the result will be added to your response.`,
          };
        }
      }

      const messages = [systemMessage, ...conversationMessages, userMessage];

      // Final safety check - estimate total token count
      const totalMessageChars = messages.reduce(
        (total, msg) => total + msg.content.length,
        0
      );
      const estimatedTokens = Math.ceil(totalMessageChars / 4);
      console.log(
        `🔍 [TOKEN CHECK] Total estimated tokens: ${estimatedTokens} (${totalMessageChars} chars)`
      );

      let result: any;
      let hasToolCalls = false;

      if (activeServerIds.length > 0) {
        result = await window.api.ai.generateResponseWithTools({
          providerId: conversationModel.providerId,
          model: conversationModel.id,
          messages,
          maxTokens: conversationModel.maxTokens,
          serverIds: activeServerIds,
        });
        hasToolCalls = !!(result.toolCalls && result.toolCalls.length > 0);
      } else {
        result = await window.api.ai.generateResponse({
          providerId: conversationModel.providerId,
          model: conversationModel.id,
          messages,
          maxTokens: conversationModel.maxTokens,
        });
      }

      if (result.success && result.response) {
        console.log(
          "[Frontend] Received successful response:",
          result.response?.substring(0, 100) + "..."
        );
        const assistantMessage = {
          role: "assistant" as const,
          content: result.response,
          modelId: conversationModelId,
        };

        // Add the assistant message
        const action = dispatch(
          addMessage({
            conversationId: currentConversation.id,
            message: assistantMessage,
          })
        );

        const messageId = (action.payload as any).message.id;

        // Handle tool calls if they exist
        if (hasToolCalls && result.toolCalls && result.toolCalls.length > 0) {
          console.log(`🔧 [TOOL_DEBUG] Found ${result.toolCalls.length} tool calls:`, result.toolCalls);
          result.toolCalls.forEach((toolCall: any) => {
            console.log(`🛠️ [TOOL_DEBUG] Processing tool call:`, {
              name: toolCall.name,
              serverId: toolCall.serverId,
              hasResult: !!toolCall.result,
              result: toolCall.result
            });
            dispatch(
              addToolCall({
                messageId,
                toolCall,
              })
            );
          });
        } else {
          console.log(`🔧 [TOOL_DEBUG] No tool calls found. hasToolCalls: ${hasToolCalls}, toolCalls:`, result.toolCalls);
        }

        // Process tool results/errors in the response
        const toolResultRegex = /<tool_result>(.*?)<\/tool_result>/gs;
        const errorRegex = /<tool_error>(.*?)<\/tool_error>/gs;

        const toolMatches = result.response?.match(toolResultRegex);
        if (toolMatches) {
          for (const match of toolMatches) {
            try {
              const resultText = match.replace(
                /<tool_result>|<\/tool_result>/g,
                ""
              );
              const resultData = JSON.parse(resultText);

              dispatch(
                addToolCall({
                  messageId,
                  toolCall: {
                    serverId: "unknown",
                    serverName: "MCP Server",
                    name: "Tool Execution",
                    args: {},
                    result: resultData,
                  },
                })
              );
            } catch (error) {
              console.error("Error processing tool result:", error);
            }
          }
        }

        const errorMatches = result.response?.match(errorRegex);
        if (errorMatches) {
          for (const match of errorMatches) {
            try {
              const errorText = match.replace(
                /<tool_error>|<\/tool_error>/g,
                ""
              );

              dispatch(
                addToolCall({
                  messageId,
                  toolCall: {
                    serverId: "unknown",
                    serverName: "MCP Server",
                    name: "Tool Execution",
                    args: {},
                    error: errorText,
                  },
                })
              );
            } catch (error) {
              console.error("Error processing tool error:", error);
            }
          }
        }

        return { success: true };
      } else {
        throw new Error(result.error || "Failed to generate response");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      message.error("Failed to send message");
      return { success: false, error };
    } finally {
      dispatch(
        setConversationGenerating({
          conversationId: currentConversation!.id,
          isGenerating: false,
        })
      );
    }
  }, [
    activeConversation,
    handleNewConversation,
    conversations,
    defaultModels,
    servers,
    dispatch,
    getConversationMessages,
  ]);

  const updateConversationModelCallback = useCallback((conversationId: string, modelId: string) => {
    dispatch(updateConversationModel({ id: conversationId, modelId }));
  }, [dispatch]);

  const updateConversationServers = useCallback((conversationId: string, serverIds: string[]) => {
    dispatch(updateConversationMcpServers({ id: conversationId, mcpServerIds: serverIds }));
  }, [dispatch]);

  const setActiveConversationId = useCallback((conversationId: string) => {
    dispatch(setActiveConversation(conversationId));
  }, [dispatch]);

  return {
    conversations,
    activeConversation,
    availableModels,
    providers,
    servers,
    activeServers: servers.filter((s) => s.isActive),
    handleNewConversation,
    handleSendMessage,
    updateConversationModel: updateConversationModelCallback,
    updateConversationServers,
    setActiveConversationId,
  };
};