import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ModelProvider, AIModel } from "@shared/types";
import { v4 as uuidv4 } from "uuid";

interface ModelState {
  providers: ModelProvider[];
  activeModelId?: string;
  defaultModels: AIModel[];
}

const defaultModels: AIModel[] = [
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
    id: "ollama",
    name: "Ollama",
    providerId: "ollama",
    contextLength: 32768,
    maxTokens: 2048,
  },
];

const defaultProviders: ModelProvider[] = [
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
    defaultModel: "llama3.2",
  },
];

const initialState: ModelState = {
  providers: defaultProviders,
  activeModelId: "ollama", // Use Ollama model ID
  defaultModels,
};

const modelSlice = createSlice({
  name: "model",
  initialState,
  reducers: {
    addProvider: (state, action: PayloadAction<Omit<ModelProvider, "id">>) => {
      const provider: ModelProvider = {
        id: uuidv4(),
        ...action.payload,
      };
      state.providers.push(provider);
    },

    updateProvider: (state, action: PayloadAction<ModelProvider>) => {
      const index = state.providers.findIndex(
        (p) => p.id === action.payload.id,
      );
      if (index !== -1) {
        state.providers[index] = action.payload;
      }
    },

    removeProvider: (state, action: PayloadAction<string>) => {
      state.providers = state.providers.filter((p) => p.id !== action.payload);
    },

    setActiveModel: (state, action: PayloadAction<string>) => {
      state.activeModelId = action.payload;
    },

    addModelToProvider: (
      state,
      action: PayloadAction<{ providerId: string; model: Omit<AIModel, "id"> }>,
    ) => {
      const provider = state.providers.find(
        (p) => p.id === action.payload.providerId,
      );
      if (provider) {
        const model: AIModel = {
          id: uuidv4(),
          ...action.payload.model,
        };
        provider.models.push(model);
      }
    },

    removeModelFromProvider: (
      state,
      action: PayloadAction<{ providerId: string; modelId: string }>,
    ) => {
      const provider = state.providers.find(
        (p) => p.id === action.payload.providerId,
      );
      if (provider) {
        provider.models = provider.models.filter(
          (m) => m.id !== action.payload.modelId,
        );
      }
    },

    setProviders: (state, action: PayloadAction<ModelProvider[]>) => {
      state.providers = action.payload;
    },
  },
});

export const {
  addProvider,
  updateProvider,
  removeProvider,
  setActiveModel,
  addModelToProvider,
  removeModelFromProvider,
  setProviders,
} = modelSlice.actions;

export default modelSlice.reducer;
