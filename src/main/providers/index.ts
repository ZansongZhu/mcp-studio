import { ModelProvider, AIProvider } from "@shared/types";
import { OpenAIProvider } from "./OpenAIProvider";
import { AnthropicProvider } from "./AnthropicProvider";
import { GeminiProvider } from "./GeminiProvider";
import { DeepSeekProvider } from "./DeepSeekProvider";
import { QwenProvider } from "./QwenProvider";
import { OllamaProvider } from "./OllamaProvider";

export { OpenAIProvider } from "./OpenAIProvider";
export { AnthropicProvider } from "./AnthropicProvider";
export { GeminiProvider } from "./GeminiProvider";
export { DeepSeekProvider } from "./DeepSeekProvider";
export { QwenProvider } from "./QwenProvider";
export { OllamaProvider } from "./OllamaProvider";

export class ProviderFactory {
  static create(providerId: string, provider?: ModelProvider): AIProvider {
    switch (providerId) {
      case "openai":
        return new OpenAIProvider(provider);
      case "anthropic":
        return new AnthropicProvider(provider);
      case "gemini":
        return new GeminiProvider(provider);
      case "deepseek":
        return new DeepSeekProvider(provider);
      case "qwen":
        return new QwenProvider(provider);
      case "ollama":
        return new OllamaProvider(provider);
      default:
        throw new Error(`Unknown provider type: ${providerId}`);
    }
  }

  static getSupportedProviders(): string[] {
    return ["openai", "anthropic", "gemini", "deepseek", "qwen", "ollama"];
  }
}