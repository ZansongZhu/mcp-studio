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
  updateConversationLastMentionedAgent,
  setActiveConversation,
  selectAllConversations,
  selectActiveConversation,
  clearConversationMessages
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
  const agents = useSelector((state: RootState) => state.agent.agents);
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

  const handleSendMessage = useCallback(async (messageContent: string, mentionedAgent?: any, mentionedAgents?: any[]) => {
    console.log("💬 [CHAT] handleSendMessage called");
    console.log("💬 [CHAT] Message:", messageContent);
    console.log("💬 [CHAT] Mentioned agent:", mentionedAgent);
    console.log("💬 [CHAT] All mentioned agents:", mentionedAgents);
    
    if (!messageContent.trim()) return;
    
    let currentConversation = activeConversation;
    if (!currentConversation) {
      handleNewConversation();
      // After creating conversation, it will become the active conversation
      // We need to return here and wait for the next call
      return { needsRetry: true };
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

    // Handle /clear command
    if (messageContent.trim() === "/clear") {
      dispatch(clearConversationMessages(currentConversation.id));
      message.success("Chat history cleared");
      return { isClearCommand: true };
    }

    // Check for multi-agent mentions and handle sequentially
    if (mentionedAgents && mentionedAgents.length > 1) {
      console.log("🔥 [MULTI_AGENT] Multiple agents detected, handling sequentially:", mentionedAgents.map(a => a.name));
      
      // Add the user message first
      const userMessage = {
        role: "user" as const,
        content: messageContent,
        modelId: currentConversation.modelId,
      };

      dispatch(
        addMessage({
          conversationId: currentConversation.id,
          message: userMessage,
        })
      );

      // Update the last mentioned agent to the first one mentioned
      if (mentionedAgents[0]) {
        dispatch(updateConversationLastMentionedAgent({ 
          id: currentConversation.id, 
          lastMentionedAgentId: mentionedAgents[0].id 
        }));
      }

      // Generate responses for each agent sequentially
      for (let i = 0; i < mentionedAgents.length; i++) {
        const agent = mentionedAgents[i];
        console.log(`🔥 [MULTI_AGENT] Processing agent ${i + 1}/${mentionedAgents.length}: ${agent.name}`);
        console.log(`🔥 [MULTI_AGENT] Agent config - Model: ${agent.modelId}, MCP Servers: ${agent.mcpServerIds}`);
        
        try {
          dispatch(
            setConversationGenerating({
              conversationId: currentConversation.id,
              isGenerating: true,
            })
          );

          // Get conversation history for context
          const conversationHistory = getConversationMessages(currentConversation.id);
          const conversationMessages = pruneConversationHistory(conversationHistory);

          // Use agent's configuration
          const messageModelId = agent.modelId;
          const messageServerIds = agent.mcpServerIds.filter(
            (serverId: string) => servers.find((s) => s.id === serverId)?.isActive
          );

          const systemContent = agent.systemInstructions || 
            "You are a helpful assistant. Use tools directly when needed without asking for permission.";

          // Add context about other agents if this isn't the first response
          const contextualSystemContent = i > 0 
            ? `${systemContent}\n\nNote: This is a multi-agent conversation. Other agents have already responded above. Please provide your unique perspective and avoid repeating what others have said.`
            : systemContent;

          let systemMessage = {
            role: "system" as const,
            content: contextualSystemContent,
          };

          // Handle MCP tools if available
          if (messageServerIds.length > 0) {
            const availableToolsPromises = messageServerIds.map(async (serverId) => {
              try {
                const server = servers.find((s) => s.id === serverId);
                if (server) {
                  return await window.api.mcp.listTools(server);
                }
                return [];
              } catch (error) {
                console.error(`Failed to fetch tools for server ${serverId}:`, error);
                return [];
              }
            });

            const allTools = await Promise.all(availableToolsPromises);
            const flattenedTools = allTools.flat();

            if (flattenedTools.length > 0) {
              const toolsDescription = flattenedTools
                .map((tool) => `Tool: ${tool.name}\nDescription: ${tool.description || "No description available"}\nParameters: ${JSON.stringify(tool.inputSchema || {})}\n`)
                .join("\n");

              systemMessage = {
                role: "system" as const,
                content: `${contextualSystemContent}\n\nYou have access to the following tools:\n\n${toolsDescription}\n\nWhen you need to use a tool, format your response like this:\n\n<tool_call>{"serverId": "SERVER_ID", "name": "TOOL_NAME", "args": {...}}</tool_call>`,
              };
            }
          }

          // Get the model for this agent
          let conversationModel = availableModels.find((m) => m.id === messageModelId);
          
          if (!conversationModel) {
            console.error(`Model not found for agent ${agent.name}: ${messageModelId}`);
            continue; // Skip this agent if model not found
          }

          const messages = [systemMessage, ...conversationMessages];
          
          // Generate response
          let result: any;
          if (messageServerIds.length > 0) {
            result = await window.api.ai.generateResponseWithTools({
              providerId: conversationModel.providerId,
              model: conversationModel.id,
              messages,
              maxTokens: conversationModel.maxTokens,
              serverIds: messageServerIds,
            });
          } else {
            result = await window.api.ai.generateResponse({
              providerId: conversationModel.providerId,
              model: conversationModel.id,
              messages,
              maxTokens: conversationModel.maxTokens,
            });
          }

          console.log(`🔥 [MULTI_AGENT] Agent ${agent.name} AI response:`, { success: result.success, hasResponse: !!result.response, error: result.error });

          if (result.success && result.response) {
            const assistantMessage = {
              role: "assistant" as const,
              content: result.response,
              modelId: messageModelId,
              agentId: agent.id,
            };

            // Add the assistant message
            dispatch(
              addMessage({
                conversationId: currentConversation.id,
                message: assistantMessage,
              })
            );

            console.log(`✅ [MULTI_AGENT] Agent ${agent.name} response added`);
          } else {
            console.log(`⚠️ [MULTI_AGENT] Agent ${agent.name} did not return a valid response`);
          }

        } catch (error) {
          console.error(`❌ [MULTI_AGENT] Error with agent ${agent.name}:`, error);
          
          // Add error message with specific backend error details
          const specificError = (error as Error).message || "Unknown error occurred";
          const errorMessage = {
            role: "assistant" as const,
            content: `Sorry, I encountered an error: ${specificError}`,
            modelId: agent.modelId,
            agentId: agent.id,
          };

          dispatch(
            addMessage({
              conversationId: currentConversation.id,
              message: errorMessage,
            })
          );
        }
        
        console.log(`🔄 [MULTI_AGENT] Completed processing agent ${i + 1}/${mentionedAgents.length}: ${agent.name}`);
      }

      // Turn off generating state
      dispatch(
        setConversationGenerating({
          conversationId: currentConversation.id,
          isGenerating: false,
        })
      );

      console.log("🎉 [MULTI_AGENT] All agents have responded");
      return { success: true, multiAgent: true };
    }

    // Define the user message
    const userMessage = {
      role: "user" as const,
      content: messageContent,
      modelId: currentConversation.modelId,
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
      // Get conversation history for context - use actual messages from the conversation
      const conversationHistory = getConversationMessages(currentConversation.id);
      const conversationMessages = pruneConversationHistory(conversationHistory);

      // Add system instructions - use agent's instructions if available
      const activeServerIds = currentConversation.mcpServerIds.filter(
        (serverId) => servers.find((s) => s.id === serverId)?.isActive
      );

      // Agent selection priority:
      // 1. Explicitly mentioned agent in current message
      // 2. Last mentioned agent in this conversation  
      // 3. Conversation's default agent (if set)
      // 4. No agent (use default system instructions)
      const selectedAgent = mentionedAgent || 
        (currentConversation.lastMentionedAgentId ? agents.find(agent => agent.id === currentConversation.lastMentionedAgentId) : null) ||
        (currentConversation.agentId ? agents.find(agent => agent.id === currentConversation.agentId) : null);

      console.log("🤖 [AGENT] Agent selection process:");
      console.log("  - Mentioned in current message:", mentionedAgent?.name || "None");
      console.log("  - Last mentioned in conversation:", currentConversation.lastMentionedAgentId ? agents.find(a => a.id === currentConversation.lastMentionedAgentId)?.name || "Unknown" : "None");
      console.log("  - Conversation default agent:", currentConversation.agentId ? agents.find(a => a.id === currentConversation.agentId)?.name || "Unknown" : "None");
      console.log("  - SELECTED AGENT:", selectedAgent?.name || "None (using default)");

      let systemContent = selectedAgent?.systemInstructions || 
        "You are a helpful assistant. Use tools directly when needed without asking for permission. When you call a tool, ALWAYS interpret and present the returned data in a clear, formatted response. Never show raw tool calls or ask the user to execute them - the tools execute automatically and you should analyze the results. Present financial data in tables, format numbers clearly, and provide meaningful insights from the data. Be concise and execute tools immediately when appropriate data is requested.";

      console.log("📝 [SYSTEM] Using system content:", systemContent.substring(0, 100) + "...");

      // If we have a selected agent (mentioned or last mentioned), use its model and MCP servers
      let messageModelId = conversationModelId;
      let messageServerIds = activeServerIds;
      
      if (selectedAgent) {
        messageModelId = selectedAgent.modelId;
        messageServerIds = selectedAgent.mcpServerIds.filter(
          (serverId: string) => servers.find((s) => s.id === serverId)?.isActive
        );
        console.log("🔄 [CONFIG] Using selected agent's config:");
        console.log("  - Model ID:", messageModelId);
        console.log("  - MCP Server IDs:", messageServerIds);
      } else {
        console.log("🔄 [CONFIG] Using default config:");
        console.log("  - Model ID:", messageModelId);
        console.log("  - MCP Server IDs:", messageServerIds);
      }

      // If an agent was explicitly mentioned in this message, update the conversation's last mentioned agent
      if (mentionedAgent) {
        console.log("💾 [CONVERSATION] Updating last mentioned agent to:", mentionedAgent.name);
        dispatch(updateConversationLastMentionedAgent({ 
          id: currentConversation.id, 
          lastMentionedAgentId: mentionedAgent.id 
        }));
      }

      // Get the model for this message (could be from mentioned agent)
      let conversationModel = availableModels.find(
        (m) => m.id === messageModelId
      );
      
      console.log("🔧 [MODEL] Looking for model:", messageModelId);
      console.log("🔧 [MODEL] Available models:", availableModels.map(m => ({ id: m.id, name: m.name })));
      console.log("🔧 [MODEL] Found model:", conversationModel);
      
      if (!conversationModel) {
        throw new Error(`Conversation model not found: ${messageModelId}. Available models: ${availableModels.map(m => m.id).join(', ')}`);
      }

      let systemMessage = {
        role: "system" as const,
        content: systemContent,
      };

      if (messageServerIds.length > 0) {
        // Get available tools for active servers
        const availableToolsPromises = messageServerIds.map(async (serverId) => {
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

      if (messageServerIds.length > 0) {
        result = await window.api.ai.generateResponseWithTools({
          providerId: conversationModel.providerId,
          model: conversationModel.id,
          messages,
          maxTokens: conversationModel.maxTokens,
          serverIds: messageServerIds,
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
          modelId: messageModelId,
          agentId: selectedAgent?.id, // Store which agent generated this message
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
      
      // Show the specific backend error message if available
      const errorMessage = (error as Error).message || "Failed to send message";
      message.error(errorMessage);
      
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
    agents,
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