import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import {
  MCPServer,
  MCPTool,
  MCPPrompt,
  MCPResource,
  MCPCallToolResponse,
  GetResourceResponse,
  ModelProvider,
} from "@shared/types";

// 添加 Node.js 模块的 polyfill，以便在渲染进程中使用
(window as any).require = (moduleName: string) => {
  if (moduleName === "cross-spawn" || moduleName === "which" || moduleName === "isexe") {
    // 返回一个模拟对象，避免实际使用这些模块
    return {
      sync: () => null,
      spawn: () => ({
        on: () => {},
        stdout: { on: () => {} },
        stderr: { on: () => {} },
      }),
    };
  }
  return null;
};

// Custom APIs for renderer
const api = {
  mcp: {
    listTools: (server: MCPServer): Promise<MCPTool[]> =>
      ipcRenderer.invoke("mcp:listTools", server),

    callTool: (params: {
      server: MCPServer;
      name: string;
      args: any;
      callId?: string;
    }): Promise<MCPCallToolResponse> =>
      ipcRenderer.invoke("mcp:callTool", params),

    listPrompts: (server: MCPServer): Promise<MCPPrompt[]> =>
      ipcRenderer.invoke("mcp:listPrompts", server),

    getPrompt: (params: { server: MCPServer; name: string; args?: any }) =>
      ipcRenderer.invoke("mcp:getPrompt", params),

    listResources: (server: MCPServer): Promise<MCPResource[]> =>
      ipcRenderer.invoke("mcp:listResources", server),

    getResource: (params: {
      server: MCPServer;
      uri: string;
    }): Promise<GetResourceResponse> =>
      ipcRenderer.invoke("mcp:getResource", params),

    stopServer: (server: MCPServer): Promise<void> =>
      ipcRenderer.invoke("mcp:stopServer", server),

    removeServer: (server: MCPServer): Promise<void> =>
      ipcRenderer.invoke("mcp:removeServer", server),

    restartServer: (server: MCPServer): Promise<void> =>
      ipcRenderer.invoke("mcp:restartServer", server),

    checkConnectivity: (server: MCPServer): Promise<boolean> =>
      ipcRenderer.invoke("mcp:checkConnectivity", server),

    abortTool: (callId: string): Promise<boolean> =>
      ipcRenderer.invoke("mcp:abortTool", callId),
  },

  ai: {
    generateResponse: (params: {
      providerId: string;
      model: string;
      messages: any[];
      maxTokens?: number;
    }): Promise<{ success: boolean; response?: string; error?: string }> =>
      ipcRenderer.invoke("ai:generateResponse", params),

    generateResponseWithTools: (params: {
      providerId: string;
      model: string;
      messages: any[];
      maxTokens?: number;
      serverIds?: string[];
    }): Promise<{
      success: boolean;
      response?: string;
      error?: string;
      toolCalls?: any[];
    }> => ipcRenderer.invoke("ai:generateResponseWithTools", params),

    updateProviders: (providers: any[]): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("ai:updateProviders", providers),
  },

  storage: {
    getModelProviders: (): Promise<ModelProvider[]> =>
      ipcRenderer.invoke("storage:getModelProviders"),

    setModelProviders: (
      providers: ModelProvider[],
    ): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("storage:setModelProviders", providers),

    setActiveModelId: (modelId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("storage:setActiveModelId", modelId),

    getActiveModelId: (): Promise<string | undefined> =>
      ipcRenderer.invoke("storage:getActiveModelId"),

    getMCPServers: (): Promise<MCPServer[]> =>
      ipcRenderer.invoke("storage:getMCPServers"),

    setMCPServers: (servers: MCPServer[]): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("storage:setMCPServers", servers),

    getPromptTemplates: (): Promise<any[]> =>
      ipcRenderer.invoke("storage:getPromptTemplates"),

    setPromptTemplates: (templates: any[]): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("storage:setPromptTemplates", templates),

    getAgents: (): Promise<any[]> =>
      ipcRenderer.invoke("storage:getAgents"),

    setAgents: (agents: any[]): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("storage:setAgents", agents),

    // Conversation persistence methods
    saveConversation: (conversation: any): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("conversations:save", conversation),

    loadConversation: (conversationId: string): Promise<{ success: boolean; conversation?: any; error?: string }> =>
      ipcRenderer.invoke("conversations:load", conversationId),

    getConversationMetadata: (): Promise<{ success: boolean; metadata?: any; error?: string }> =>
      ipcRenderer.invoke("conversations:metadata"),

    deleteConversation: (conversationId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("conversations:delete", conversationId),

    pruneConversationMessages: (conversationId: string, maxMessages?: number): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("conversations:prune", conversationId, maxMessages),
  },

  credentials: {
    store: (providerId: string, apiKey: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("credentials:store", providerId, apiKey),

    get: (providerId: string): Promise<{ success: boolean; apiKey?: string; error?: string }> =>
      ipcRenderer.invoke("credentials:get", providerId),

    delete: (providerId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("credentials:delete", providerId),

    getMetadata: (): Promise<{ success: boolean; metadata?: any; error?: string }> =>
      ipcRenderer.invoke("credentials:metadata"),
  },

  monitoring: {
    getLogs: (level?: string): Promise<{ success: boolean; logs?: any[]; error?: string }> =>
      ipcRenderer.invoke("monitoring:getLogs", level),

    getMetrics: (): Promise<{ success: boolean; metrics?: any; error?: string }> =>
      ipcRenderer.invoke("monitoring:getMetrics"),

    clearLogs: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("monitoring:clearLogs"),
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if ((window as any).process?.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
