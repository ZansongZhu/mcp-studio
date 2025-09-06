import { useCallback } from "react";
import { ModelProvider, MCPServer, Agent } from "@shared/types";

export const useStorage = () => {
  // Remove the automatic loading logic since AppInitializer handles it

  const saveProviders = useCallback(async (providers: ModelProvider[]) => {
    try {
      await window.api.storage.setModelProviders(providers);
    } catch (error) {
      console.error("Failed to save providers:", error);
    }
  }, []);

  const saveActiveModelId = useCallback(async (modelId: string) => {
    try {
      await window.api.storage.setActiveModelId(modelId);
    } catch (error) {
      console.error("Failed to save active model:", error);
    }
  }, []);

  const saveMCPServers = useCallback(async (servers: MCPServer[]) => {
    try {
      await window.api.storage.setMCPServers(servers);
    } catch (error) {
      console.error("Failed to save MCP servers:", error);
    }
  }, []);

  const saveAgents = useCallback(async (agents: Agent[]) => {
    try {
      await window.api.storage.setAgents(agents);
    } catch (error) {
      console.error("Failed to save agents:", error);
    }
  }, []);

  return { saveProviders, saveActiveModelId, saveMCPServers, saveAgents };
};
