import React, { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { setProviders, setActiveModel } from "../store/modelSlice";
import { setServers } from "../store/mcpSlice";
import { ModelProvider } from "@shared/types";

// Define default providers with Ollama included
const getDefaultProviders = (): ModelProvider[] => {
  const defaultModels = [
    {
      id: "gpt-4o",
      name: "GPT-4o",
      providerId: "openai",
      contextLength: 128000,
      maxTokens: 4096,
      pricing: { input: 0.005, output: 0.015 },
    },
    {
      id: "gpt-4o-mini",
      name: "GPT-4o Mini", 
      providerId: "openai",
      contextLength: 128000,
      maxTokens: 16384,
      pricing: { input: 0.00015, output: 0.0006 },
    },
    {
      id: "gpt-5",
      name: "GPT-5",
      providerId: "openai",
      contextLength: 200000,
      maxTokens: 8192,
      pricing: { input: 0.01, output: 0.03 },
    },
    {
      id: "claude-3-5-sonnet-20241022",
      name: "Claude 3.5 Sonnet",
      providerId: "anthropic",
      contextLength: 200000,
      maxTokens: 8192,
      pricing: { input: 0.003, output: 0.015 },
    },
    {
      id: "claude-3-5-haiku-20241022",
      name: "Claude 3.5 Haiku",
      providerId: "anthropic",
      contextLength: 200000,
      maxTokens: 8192,
      pricing: { input: 0.001, output: 0.005 },
    },
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      providerId: "deepseek",
      contextLength: 1000000,
      maxTokens: 8192,
      pricing: { input: 0.00014, output: 0.00028 },
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      providerId: "deepseek",
      contextLength: 1000000,
      maxTokens: 8192,
      pricing: { input: 0.000435, output: 0.00087 },
    },
    {
      id: "qwen3.7-max",
      name: "Qwen 3.7 Max",
      providerId: "qwen",
      contextLength: 1000000,
      maxTokens: 8192,
      pricing: { input: 0.0025, output: 0.0075 },
    },
    {
      id: "qwen3.7-plus",
      name: "Qwen 3.7 Plus",
      providerId: "qwen",
      contextLength: 1000000,
      maxTokens: 8192,
      pricing: { input: 0.00032, output: 0.00128 },
    },
    {
      id: "glm-5.2",
      name: "GLM-5.2",
      providerId: "glm",
      contextLength: 1000000,
      maxTokens: 8192,
      pricing: { input: 0.00093, output: 0.003 },
    },
    {
      id: "kimi-k3",
      name: "Kimi K3",
      providerId: "kimi",
      contextLength: 1000000,
      maxTokens: 131072,
      pricing: { input: 0.003, output: 0.015 },
    },
    {
      id: "kimi-k2.7-code-highspeed",
      name: "Kimi K2.7 Code Highspeed",
      providerId: "kimi",
      contextLength: 256000,
      maxTokens: 8192,
      pricing: { input: 0.001, output: 0.004 },
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      providerId: "gemini",
      contextLength: 2000000,
      maxTokens: 8192,
      pricing: { input: 0.00125, output: 0.00375 },
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      providerId: "gemini", 
      contextLength: 1000000,
      maxTokens: 8192,
      pricing: { input: 0.000075, output: 0.0003 },
    },
  ];

  return [
    {
      id: "openai",
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      models: defaultModels.filter((m) => m.providerId === "openai"),
    },
    {
      id: "anthropic",
      name: "Anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "",
      models: defaultModels.filter((m) => m.providerId === "anthropic"),
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "",
      models: defaultModels.filter((m) => m.providerId === "deepseek"),
    },
    {
      id: "qwen",
      name: "Qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "",
      models: defaultModels.filter((m) => m.providerId === "qwen"),
    },
    {
      id: "glm",
      name: "Zhipu GLM",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: "",
      models: defaultModels.filter((m) => m.providerId === "glm"),
    },
    {
      id: "kimi",
      name: "Kimi (Moonshot)",
      baseUrl: "https://api.moonshot.ai/v1",
      apiKey: "",
      models: defaultModels.filter((m) => m.providerId === "kimi"),
    },
    {
      id: "gemini",
      name: "Google Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1",
      apiKey: "",
      models: defaultModels.filter((m) => m.providerId === "gemini"),
    },
    {
      id: "ollama",
      name: "Ollama",
      baseUrl: "http://localhost:11434",
      apiKey: "",
      models: defaultModels.filter((m) => m.providerId === "ollama"),
    },
  ];
};

const AppInitializer: React.FC = () => {
  const dispatch = useDispatch();
  const initialized = useRef(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (initialized.current) return;
    initialized.current = true;

    // Check if window.api exists
    if (!(window as any).api) {
      console.error("API not available. Make sure preload script is loaded correctly.");
      return;
    }

    const loadStoredData = async () => {
      try {
        const defaultProviders = getDefaultProviders();
        
        // Load stored providers
        const storedProviders = await (window as any).api.storage.getModelProviders();
        if (storedProviders && storedProviders.length > 0) {
          // Merge stored providers with defaults to ensure new providers like Ollama are included
          const mergedProviders = mergeProviders(defaultProviders, storedProviders);
          dispatch(setProviders(mergedProviders));
          console.log(`Loaded ${mergedProviders.length} providers (${storedProviders.length} stored + ${mergedProviders.length - storedProviders.length} new defaults)`);

          // Persist the merged/migrated providers so the main process AIService
          // and the store pick up base URL migrations (e.g. Qwen's endpoint).
          try {
            await (window as any).api.storage.setModelProviders(mergedProviders);
            await (window as any).api.ai.updateProviders(mergedProviders);
          } catch (syncError) {
            console.error("Failed to sync merged providers to main:", syncError);
          }
        } else {
          // No stored providers, use defaults
          dispatch(setProviders(defaultProviders));
          console.log(`Using ${defaultProviders.length} default providers`);
        }

        // Load active model
        const storedActiveModelId = await (window as any).api.storage.getActiveModelId();
        if (storedActiveModelId) {
          dispatch(setActiveModel(storedActiveModelId));
        }

        // Load stored MCP servers
        const storedServers = await (window as any).api.storage.getMCPServers();
        if (storedServers && storedServers.length > 0) {
          dispatch(setServers(storedServers));
        }
      } catch (error) {
        console.error("Failed to load stored data:", error);
      }
    };

    loadStoredData();
  }, [dispatch]);

  // Helper function to merge default providers with stored ones
  const mergeProviders = (defaultProviders: ModelProvider[], storedProviders: ModelProvider[]): ModelProvider[] => {
    const merged = [...storedProviders];
    
    // Add any default providers that aren't in stored providers
    defaultProviders.forEach(defaultProvider => {
      const existingProvider = merged.find(p => p.id === defaultProvider.id);
      if (!existingProvider) {
        console.log(`Adding missing default provider: ${defaultProvider.name}`);
        merged.push(defaultProvider);
      } else {
        // Migrate obsolete base URLs to the current default (e.g. Qwen's
        // native /api/v1 endpoint, which is incompatible with the OpenAI SDK).
        const obsoleteBaseUrls = ['https://dashscope.aliyuncs.com/api/v1'];
        if (existingProvider.baseUrl && obsoleteBaseUrls.includes(existingProvider.baseUrl)) {
          console.log(`Migrating obsolete base URL for ${existingProvider.name}: ${existingProvider.baseUrl} -> ${defaultProvider.baseUrl}`);
          existingProvider.baseUrl = defaultProvider.baseUrl;
        }

        // Remove obsolete models (like llama3.2 and retired Qwen tiers)
        const obsoleteModelIds = ['llama3.2', 'qwen-max', 'qwen-plus'];
        const originalCount = existingProvider.models.length;
        existingProvider.models = existingProvider.models.filter(model => !obsoleteModelIds.includes(model.id));
        if (existingProvider.models.length < originalCount) {
          console.log(`Removed obsolete models from ${existingProvider.name}`);
        }
        
        // Update existing provider with new models from defaults
        const existingModelIds = new Set(existingProvider.models.map(m => m.id));
        const newModels = defaultProvider.models.filter(model => !existingModelIds.has(model.id));
        
        if (newModels.length > 0) {
          console.log(`Adding ${newModels.length} new models to ${existingProvider.name}: ${newModels.map(m => m.name).join(', ')}`);
          existingProvider.models.push(...newModels);
        }
      }
    });
    
    return merged;
  };

  return null; // This component doesn't render anything
};

export default AppInitializer;
