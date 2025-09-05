import { ElectronAPI } from "@electron-toolkit/preload";
import {
  MCPServer,
  MCPTool,
  MCPPrompt,
  MCPResource,
  MCPCallToolResponse,
  GetResourceResponse,
  ModelProvider,
} from "../shared/types";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      mcp: {
        listTools: (server: MCPServer) => Promise<MCPTool[]>;
        callTool: (params: {
          server: MCPServer;
          name: string;
          args: any;
          callId?: string;
        }) => Promise<MCPCallToolResponse>;
        listPrompts: (server: MCPServer) => Promise<MCPPrompt[]>;
        getPrompt: (params: {
          server: MCPServer;
          name: string;
          args?: any;
        }) => Promise<any>;
        listResources: (server: MCPServer) => Promise<MCPResource[]>;
        getResource: (params: {
          server: MCPServer;
          uri: string;
        }) => Promise<GetResourceResponse>;
        stopServer: (server: MCPServer) => Promise<void>;
        removeServer: (server: MCPServer) => Promise<void>;
        restartServer: (server: MCPServer) => Promise<void>;
        checkConnectivity: (server: MCPServer) => Promise<boolean>;
        abortTool: (callId: string) => Promise<boolean>;
      };
      ai: {
        generateResponse: (params: {
          providerId: string;
          model: string;
          messages: any[];
          maxTokens?: number;
        }) => Promise<{ success: boolean; response?: string; error?: string }>;
        generateResponseWithTools: (params: {
          providerId: string;
          model: string;
          messages: any[];
          maxTokens?: number;
          serverIds?: string[];
        }) => Promise<{
          success: boolean;
          response?: string;
          error?: string;
          toolCalls?: any[];
        }>;
        updateProviders: (providers: any[]) => Promise<{ success: boolean }>;
      };
      storage: {
        getModelProviders: () => Promise<ModelProvider[]>;
        setModelProviders: (
          providers: ModelProvider[],
        ) => Promise<{ success: boolean }>;
        setActiveModelId: (modelId: string) => Promise<{ success: boolean }>;
        getActiveModelId: () => Promise<string | undefined>;
        getMCPServers: () => Promise<MCPServer[]>;
        setMCPServers: (servers: MCPServer[]) => Promise<{ success: boolean }>;
        getPromptTemplates: () => Promise<any[]>;
        setPromptTemplates: (templates: any[]) => Promise<{ success: boolean }>;
      };
    };
  }
}
