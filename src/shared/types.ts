export interface MCPServer {
  id: string;
  name: string;
  description?: string;
  type: "stdio" | "sse" | "streamableHttp" | "inMemory";
  baseUrl?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  isActive: boolean;
  timeout?: number;
  longRunning?: boolean;
  disabledTools?: string[];
  disabledAutoApproveTools?: string[];
}

export interface MCPTool {
  id: string;
  name: string;
  description?: string;
  inputSchema?: any;
  serverId: string;
  serverName: string;
}

export interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  text?: string;
  serverId: string;
  serverName: string;
}

export interface MCPPrompt {
  id: string;
  name: string;
  description?: string;
  arguments?: any[];
  serverId: string;
  serverName: string;
}

export interface MCPCallToolResponse {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: any;
  }>;
  isError?: boolean;
}

export interface GetResourceResponse {
  contents: MCPResource[];
}

export interface ModelProvider {
  id: string;
  name: string;
  baseUrl?: string;
  apiKey?: string;
  models: AIModel[];
  defaultModel?: string; // For providers like Ollama that need a default model name
}

export interface AIModel {
  id: string;
  name: string;
  providerId: string;
  contextLength?: number;
  maxTokens?: number;
  pricing?: {
    input: number;
    output: number;
  };
}

// New interfaces for refactored architecture
export interface AIProvider {
  generateResponse(
    messages: any[],
    model: string,
    maxTokens?: number
  ): Promise<string>;
  
  generateResponseWithTools?(
    messages: any[],
    model: string,
    maxTokens: number | undefined,
    tools: any[],
    servers: any[]
  ): Promise<AIProviderResponse>;
  
  setProvider(provider: ModelProvider): void;
}

export interface AIProviderResponse {
  success: boolean;
  response?: string;
  error?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: any;
  result?: any;
  error?: string;
  serverId: string;
  serverName: string;
}

export interface ProcessedToolResponse {
  processedResponse: string;
  toolCalls: ToolCall[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Event system types
export interface AppEvents {
  'conversation:created': { id: string; title: string };
  'conversation:updated': { id: string };
  'message:added': { conversationId: string; messageId: string };
  'tool:executed': { toolCall: ToolCall; result: any };
  'server:connected': { serverId: string; serverName: string };
  'server:disconnected': { serverId: string; serverName: string };
  'provider:error': { providerId: string; error: string };
}

// Metrics types
export interface ToolExecutionMetric {
  toolName: string;
  duration: number;
  serverId: string;
  success: boolean;
  timestamp: number;
}

export interface ConversationMetric {
  conversationId: string;
  messageCount: number;
  tokenUsage: number;
  duration: number;
  providerId: string;
  timestamp: number;
}

// Agent types
export interface Agent {
  id: string;
  name: string;
  description?: string;
  modelId: string;
  mcpServerIds: string[];
  systemInstructions?: string;
  createdAt: number;
  updatedAt: number;
}