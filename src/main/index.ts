import { app, shell, BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { ModelProvider, MCPServer } from "@shared/types";
import { logger, eventBus, metricsCollector } from "@shared/monitoring";
import { validateMCPServerConfig } from "@shared/validation";

// Import services
import mcpService from "./services/MCPService";
import aiService from "./services/AIService";
import { storageService } from "./services/StorageService";
import { credentialManager } from "./services/CredentialManager";
import { conversationPersistence } from "./services/ConversationPersistence";

const icon = join(__dirname, "../../resources/icon.png");

function createWindow(): void {
  // Create the browser window
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false, // Security: Disable node integration
      // enableRemoteModule: false, // Security: Disable remote module (deprecated)
      // Disable autofill to prevent DevTools errors
      autoplayPolicy: "document-user-activation-required",
      spellcheck: false,
      // Windows debugging: Enable DevTools in production for debugging
      ...(process.platform === "win32" ? { webSecurity: true } : {}),
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    logger.info("Main window ready to show");
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    logger.error(`Failed to load window: ${errorCode} - ${errorDescription}`);
    // Windows debugging: Show detailed error in production
    if (process.platform === "win32") {
      console.error(`[Windows] Renderer load failed: ${errorCode} - ${errorDescription}`);
      console.error(`[Windows] Preload path: ${join(__dirname, "../preload/index.js")}`);
      console.error(`[Windows] HTML path: ${join(__dirname, "../renderer/index.html")}`);
    }
  });

  mainWindow.webContents.on("dom-ready", () => {
    logger.info("DOM ready in renderer");
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // Security: Prevent new window creation (handled by setWindowOpenHandler above)

  // Load the app
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    const url = process.env["ELECTRON_RENDERER_URL"];
    logger.info(`Loading dev server URL: ${url}`);
    mainWindow.loadURL(url);
  } else {
    const htmlPath = join(__dirname, "../renderer/index.html");
    logger.info(`Loading HTML file: ${htmlPath}`);
    // Windows debugging: Open DevTools automatically for production debugging
    if (process.platform === "win32") {
      mainWindow.webContents.once('dom-ready', () => {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
        console.log("[Windows] DevTools opened for debugging");
      });
    }
    mainWindow.loadFile(htmlPath);
  }
}

async function initializeApp() {
  try {
    // Initialize services
    logger.info("Initializing MCP Studio application");

    // Load stored providers and initialize AI service
    const storedProviders = storageService.getModelProviders();
    
    // Use API keys directly from stored providers (external config or electron-store)
    console.log(`[Main] Using API keys directly from providers configuration`);
    aiService.updateProviders(storedProviders);
    logger.info(`Initialized ${storedProviders.length} AI providers`);

    // Set up event listeners
    eventBus.on('provider:error', (data) => {
      logger.error(`Provider error: ${data.providerId}`, { providerId: data.providerId, error: data.error });
    });

    eventBus.on('tool:executed', (data) => {
      metricsCollector.trackToolExecution({
        toolName: data.toolCall.name,
        duration: 100, // Default duration since timestamp is not available
        serverId: data.toolCall.serverId,
        success: !data.toolCall.error,
        timestamp: Date.now(),
      });
    });

    logger.info("Application initialization completed successfully");
  } catch (error) {
    logger.error("Failed to initialize application", {}, error as Error);
    throw error;
  }
}

// App event handlers
app.whenReady().then(async () => {
  try {
    await initializeApp();

    // Set app user model id for windows
    electronApp.setAppUserModelId("com.mcp-studio");

    // Default open or close DevTools by F12 in development
    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    // Setup IPC handlers for MCP
    setupMCPIPCHandlers();
    setupAIIPCHandlers();
    setupStorageIPCHandlers();
    setupCredentialIPCHandlers();
    setupConversationIPCHandlers();
    setupMonitoringIPCHandlers();

    createWindow();

    app.on("activate", function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    logger.info("Electron app ready and initialized");
  } catch (error) {
    logger.error("Failed to start application", {}, error as Error);
    app.quit();
  }
});

// Quit when all windows are closed
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  logger.info("Application shutting down");
  
  try {
    await mcpService.cleanup();
    credentialManager.clearCache();
    logger.info("Cleanup completed successfully");
  } catch (error) {
    logger.error("Error during application cleanup", {}, error as Error);
  }
});

// IPC Handler Setup Functions
function setupMCPIPCHandlers() {
  ipcMain.handle("mcp:listTools", mcpService.listTools.bind(mcpService));
  ipcMain.handle("mcp:callTool", mcpService.callTool.bind(mcpService));
  ipcMain.handle("mcp:listPrompts", mcpService.listPrompts.bind(mcpService));
  ipcMain.handle("mcp:getPrompt", mcpService.getPrompt.bind(mcpService));
  ipcMain.handle("mcp:listResources", mcpService.listResources.bind(mcpService));
  ipcMain.handle("mcp:getResource", mcpService.getResource.bind(mcpService));
  ipcMain.handle("mcp:stopServer", mcpService.stopServer.bind(mcpService));
  ipcMain.handle("mcp:removeServer", mcpService.removeServer.bind(mcpService));
  ipcMain.handle("mcp:restartServer", mcpService.restartServer.bind(mcpService));
  ipcMain.handle("mcp:checkConnectivity", mcpService.checkConnectivity.bind(mcpService));
  ipcMain.handle("mcp:abortTool", mcpService.abortTool.bind(mcpService));

  logger.debug("MCP IPC handlers registered");
}

function setupAIIPCHandlers() {
  ipcMain.handle(
    "ai:generateResponse",
    async (_, params: { providerId: string; model: string; messages: any[]; maxTokens?: number }) => {
      const startTime = Date.now();
      
      try {
        logger.info("AI generate response request", {
          providerId: params.providerId,
          model: params.model,
          messageCount: params.messages?.length,
        });

        const response = await aiService.generateResponse(
          params.providerId,
          params.model,
          params.messages,
          params.maxTokens
        );

        const duration = Date.now() - startTime;
        logger.info("AI generate response success", {
          providerId: params.providerId,
          model: params.model,
          responseLength: response?.length,
          duration,
        });

        return { success: true, response };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("AI generate response error", {
          providerId: params.providerId,
          model: params.model,
          duration,
        }, error as Error);

        eventBus.emit('provider:error', {
          providerId: params.providerId,
          error: (error as Error).message,
        });

        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    "ai:generateResponseWithTools",
    async (_, params: { providerId: string; model: string; messages: any[]; maxTokens?: number; serverIds?: string[] }) => {
      const startTime = Date.now();
      
      try {
        // Update active servers
        const allServers = storageService.getMCPServers();
        const activeServers = allServers.filter((s) => s.isActive);
        aiService.setActiveServers(activeServers);

        const response = await aiService.generateResponseWithTools(
          params.providerId,
          params.model,
          params.messages,
          params.maxTokens,
          params.serverIds
        );

        const duration = Date.now() - startTime;
        logger.info("AI generate response with tools completed", {
          providerId: params.providerId,
          model: params.model,
          duration,
          toolCallCount: response.toolCalls?.length || 0,
        });

        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("AI generate response with tools error", {
          providerId: params.providerId,
          model: params.model,
          duration,
        }, error as Error);

        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle("ai:updateProviders", async (_, providers: ModelProvider[]) => {
    try {
      // Use API keys directly from providers configuration
      aiService.updateProviders(providers);
      storageService.setModelProviders(providers);

      logger.info("AI providers updated", { providerCount: providers.length });
      return { success: true };
    } catch (error) {
      logger.error("Failed to update AI providers", {}, error as Error);
      return { success: false, error: (error as Error).message };
    }
  });

  logger.debug("AI IPC handlers registered");
}

function setupCredentialIPCHandlers() {
  // Credential manager has been removed - API keys are now used directly from config
  logger.debug("Credential IPC handlers disabled - using API keys directly from config");
}

function setupConversationIPCHandlers() {
  ipcMain.handle("conversations:save", async (_, conversation: any) => {
    try {
      await conversationPersistence.saveConversation(conversation);
      return { success: true };
    } catch (error) {
      logger.error("Failed to save conversation", { conversationId: conversation.id }, error as Error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("conversations:load", async (_, conversationId: string) => {
    try {
      const conversation = await conversationPersistence.loadConversation(conversationId);
      return { success: true, conversation };
    } catch (error) {
      logger.error("Failed to load conversation", { conversationId }, error as Error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("conversations:metadata", async () => {
    try {
      const metadata = await conversationPersistence.getConversationMetadata();
      return { success: true, metadata };
    } catch (error) {
      logger.error("Failed to get conversation metadata", {}, error as Error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("conversations:delete", async (_, conversationId: string) => {
    try {
      await conversationPersistence.deleteConversation(conversationId);
      return { success: true };
    } catch (error) {
      logger.error("Failed to delete conversation", { conversationId }, error as Error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("conversations:prune", async (_, conversationId: string, maxMessages?: number) => {
    try {
      await conversationPersistence.pruneConversationMessages(conversationId, maxMessages);
      return { success: true };
    } catch (error) {
      logger.error("Failed to prune conversation", { conversationId }, error as Error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("conversations:stats", async () => {
    try {
      const stats = await conversationPersistence.getStorageStats();
      return { success: true, stats };
    } catch (error) {
      logger.error("Failed to get storage stats", {}, error as Error);
      return { success: false, error: (error as Error).message };
    }
  });

  logger.debug("Conversation IPC handlers registered");
}

function setupStorageIPCHandlers() {
  // Legacy storage handlers for compatibility
  ipcMain.handle("storage:getModelProviders", () => {
    return storageService.getModelProviders();
  });

  ipcMain.handle("storage:setModelProviders", (_, providers: ModelProvider[]) => {
    storageService.setModelProviders(providers);
    return { success: true };
  });

  ipcMain.handle("storage:setActiveModelId", (_, modelId: string) => {
    storageService.setActiveModelId(modelId);
    return { success: true };
  });

  ipcMain.handle("storage:getActiveModelId", () => {
    return storageService.getActiveModelId();
  });

  ipcMain.handle("storage:getMCPServers", () => {
    return storageService.getMCPServers();
  });

  ipcMain.handle("storage:setMCPServers", (_, servers: MCPServer[]) => {
    // Validate servers before storing
    for (const server of servers) {
      const validation = validateMCPServerConfig(server);
      if (!validation.isValid) {
        logger.warn("Invalid MCP server config", { serverId: server.id, errors: validation.errors });
      }
    }
    
    storageService.setMCPServers(servers);
    return { success: true };
  });

  ipcMain.handle("storage:getPromptTemplates", () => {
    return storageService.getPromptTemplates();
  });

  ipcMain.handle("storage:setPromptTemplates", (_, templates: any[]) => {
    storageService.setPromptTemplates(templates);
    return { success: true };
  });

  logger.debug("Storage IPC handlers registered");
}

function setupMonitoringIPCHandlers() {
  ipcMain.handle("monitoring:getLogs", (_, level?: string) => {
    try {
      const logs = logger.getLogs(level as any);
      return { success: true, logs };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("monitoring:getMetrics", () => {
    try {
      const metrics = metricsCollector.exportMetrics();
      return { success: true, metrics };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("monitoring:clearLogs", () => {
    try {
      logger.clearLogs();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  logger.debug("Monitoring IPC handlers registered");
}