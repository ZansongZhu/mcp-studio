import { BaseProvider } from "./BaseProvider";
import { ModelProvider, AIProviderResponse } from "@shared/types";

export class OllamaProvider extends BaseProvider {
  constructor(provider?: ModelProvider) {
    super(provider, "openai"); // Use openai config as fallback for timeout/retry settings
  }

  async generateResponse(
    messages: any[],
    _model: string,
    maxTokens?: number
  ): Promise<string> {
    // Always use the provider's default model for Ollama
    const actualModel = this.provider?.defaultModel || 'llama3.2';
    
    console.log(`[OllamaProvider] DEBUG: Provider config:`, {
      providerId: this.provider?.id,
      providerName: this.provider?.name,
      defaultModel: this.provider?.defaultModel,
      baseUrl: this.provider?.baseUrl,
      actualModelToUse: actualModel
    });
    
    this.logProviderCall("ollama", actualModel, messages.length);

    const baseUrl = this.provider?.baseUrl || "http://localhost:11434";
    
    try {
      const response = await this.withRetry(async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: actualModel,
            messages: messages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            stream: false,
            options: {
              num_predict: maxTokens || 2048,
            }
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Ollama API error: ${response.status} - ${error}`);
        }

        return response.json();
      });

      const content = response.message?.content || "";
      this.logProviderSuccess("ollama", actualModel, content.length);
      return content;
    } catch (error) {
      this.logProviderError("ollama", actualModel, error as Error);
      throw error;
    }
  }

  async generateResponseWithTools(
    messages: any[],
    model: string,
    maxTokens: number | undefined,
    _tools: any[],
    _servers: any[]
  ): Promise<AIProviderResponse> {
    try {
      // For now, Ollama doesn't have native tool calling support like OpenAI/Anthropic
      // So we fall back to regular response generation
      const response = await this.generateResponse(messages, model, maxTokens);
      return {
        success: true,
        response,
        toolCalls: []
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}