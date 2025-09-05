export const AppConfig = {
  ai: {
    maxTokens: 8192,
    maxHistoryMessages: 50,
    maxHistoryChars: 80000, // ~20k tokens
    defaultTemperature: 0.7,
    toolCallTimeout: 60000,
    providers: {
      openai: {
        baseUrl: "https://api.openai.com/v1",
        maxRetries: 3,
        timeout: 30000,
      },
      anthropic: {
        baseUrl: "https://api.anthropic.com",
        maxRetries: 3,
        timeout: 30000,
      },
      gemini: {
        baseUrl: "https://generativelanguage.googleapis.com/v1",
        maxRetries: 3,
        timeout: 30000,
      },
      deepseek: {
        baseUrl: "https://api.deepseek.com/v1",
        maxRetries: 3,
        timeout: 30000,
      },
      qwen: {
        baseUrl: "https://dashscope.aliyuncs.com/api/v1",
        maxRetries: 3,
        timeout: 30000,
      },
    },
  },
  mcp: {
    connectionTimeout: 60000,
    retryAttempts: 3,
    maxConcurrentConnections: 10,
    healthCheckInterval: 30000,
  },
  ui: {
    maxConversationsInMemory: 20,
    autoSaveInterval: 5000,
    messageUpdateDebounce: 300,
  },
  storage: {
    encryptionKey: 'default-key-change-in-production',
    conversationsPersistPath: 'conversations',
    credentialsPersistPath: 'credentials',
  },
} as const;

export type AppConfigType = typeof AppConfig;