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
      id: "deepseek-chat",
      name: "DeepSeek Chat",
      providerId: "deepseek",
      contextLength: 64000,
      maxTokens: 4096,
      pricing: { input: 0.0001, output: 0.0002 },
    },
    {
      id: "deepseek-coder",
      name: "DeepSeek Coder",
      providerId: "deepseek",
      contextLength: 16000,
      maxTokens: 4096,
      pricing: { input: 0.0001, output: 0.0002 },
    },
    {
      id: "qwen-max",
      name: "Qwen Max",
      providerId: "qwen",
      contextLength: 30000,
      maxTokens: 2000,
      pricing: { input: 0.0001, output: 0.0002 },
    },
    {
      id: "qwen-plus",
      name: "Qwen Plus",
      providerId: "qwen",
      contextLength: 30000,
      maxTokens: 2000,
      pricing: { input: 0.00005, output: 0.0001 },
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
    {
      id: "llama3.2",
      name: "Llama 3.2",
      providerId: "ollama",
      contextLength: 32768,
      maxTokens: 2048,
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
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "",
      models: defaultModels.filter((m) => m.providerId === "deepseek"),
    },
    {
      id: "qwen",
      name: "Qwen",
      baseUrl: "https://dashscope.aliyuncs.com/api/v1",
      apiKey: "",
      models: defaultModels.filter((m) => m.providerId === "qwen"),
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
      if (!merged.find(p => p.id === defaultProvider.id)) {
        console.log(`Adding missing default provider: ${defaultProvider.name}`);
        merged.push(defaultProvider);
      }
    });
    
    return merged;
  };

  return null; // This component doesn't render anything
};

export default AppInitializer;
