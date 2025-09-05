import { AIProvider, ModelProvider, AIProviderResponse } from "@shared/types";
import { AppConfig } from "@shared/config";

export abstract class BaseProvider implements AIProvider {
  protected provider: ModelProvider | null = null;
  protected readonly config: typeof AppConfig.ai.providers[keyof typeof AppConfig.ai.providers];

  constructor(provider?: ModelProvider, configKey?: keyof typeof AppConfig.ai.providers) {
    this.provider = provider || null;
    this.config = configKey ? AppConfig.ai.providers[configKey] : AppConfig.ai.providers.openai;
  }

  abstract generateResponse(
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

  setProvider(provider: ModelProvider): void {
    console.log(`[BaseProvider] setProvider called for ${provider.id}:`, {
      providerId: provider.id,
      defaultModel: provider.defaultModel,
      baseUrl: provider.baseUrl
    });
    this.provider = provider;
  }

  protected validateProvider(): void {
    if (!this.provider?.apiKey) {
      throw new Error(`${this.provider?.name || 'Provider'} API key is not configured`);
    }
  }

  protected getBaseConfig() {
    return {
      apiKey: this.provider?.apiKey,
      baseURL: this.provider?.baseUrl || this.config.baseUrl,
      timeout: this.config.timeout,
    };
  }

  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.config.maxRetries
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.warn(`Attempt ${attempt}/${maxRetries} failed:`, error);
        
        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  protected logProviderCall(providerId: string, model: string, messageCount: number): void {
    console.log(
      `🤖 [${providerId.toUpperCase()}] Starting call to ${model} | Messages: ${messageCount}`
    );
  }

  protected logProviderSuccess(providerId: string, model: string, responseLength: number): void {
    console.log(
      `✅ [${providerId.toUpperCase()}] Success ${model} | Response: ${responseLength} chars`
    );
  }

  protected logProviderError(providerId: string, model: string, error: Error): void {
    console.error(`❌ [${providerId.toUpperCase()}] Failed ${model}:`, error);
  }
}