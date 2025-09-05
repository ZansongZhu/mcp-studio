import { BaseProvider } from "./BaseProvider";
import { ModelProvider } from "@shared/types";

export class QwenProvider extends BaseProvider {
  constructor(provider?: ModelProvider) {
    super(provider, 'qwen');
  }

  async generateResponse(
    messages: any[],
    model: string,
    maxTokens?: number
  ): Promise<string> {
    this.logProviderCall('qwen', model, messages?.length);
    this.validateProvider();

    const OpenAI = require("openai");
    const client = new OpenAI(this.getBaseConfig());

    return await this.withRetry(async () => {
      const completion = await client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content || "";
      this.logProviderSuccess('qwen', model, response.length);
      return response;
    });
  }
}