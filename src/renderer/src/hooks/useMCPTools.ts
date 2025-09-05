import { useState, useCallback } from "react";
import { message } from "antd";
import { MCPTool } from "@shared/types";

export const useMCPTools = () => {
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [serverToolsList, setServerToolsList] = useState<Record<string, MCPTool[]>>({});
  const [loadingTools, setLoadingTools] = useState(false);

  const fetchAllServerTools = useCallback(async (servers: any[], activeConversation: any) => {
    if (!activeConversation) return;

    setLoadingTools(true);
    setServerToolsList({});

    try {
      // Get all active servers for this conversation
      const activeServers = servers.filter(
        (s) => activeConversation.mcpServerIds.includes(s.id) && s.isActive
      );

      // Fetch tools for each server
      const toolsPromises = activeServers.map(async (server) => {
        try {
          const tools = await window.api.mcp.listTools(server);
          return { serverId: server.id, tools };
        } catch (error) {
          console.error(
            `Failed to fetch tools for server ${server.name}:`,
            error
          );
          return { serverId: server.id, tools: [] };
        }
      });

      const results = await Promise.all(toolsPromises);

      // Convert to our state format
      const newToolsList: Record<string, MCPTool[]> = {};
      results.forEach(({ serverId, tools }) => {
        newToolsList[serverId] = tools;
      });

      setServerToolsList(newToolsList);
    } catch (error) {
      console.error("Error fetching server tools:", error);
      message.error("Failed to fetch server tools");
    } finally {
      setLoadingTools(false);
    }
  }, []);

  const openToolsModal = useCallback(() => {
    setShowToolsModal(true);
  }, []);

  const closeToolsModal = useCallback(() => {
    setShowToolsModal(false);
  }, []);

  return {
    showToolsModal,
    serverToolsList,
    loadingTools,
    fetchAllServerTools,
    openToolsModal,
    closeToolsModal,
  };
};