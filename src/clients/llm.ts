import { generateText, generateObject, LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { loadEnv } from '../config/env';
import { retryWithBackoff } from '../utils/retry';
import { z } from 'zod';

export interface LLMOptions {
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
}

export class LLMClient {
  private getModel(options?: LLMOptions): LanguageModel {
    const env = loadEnv();
    const providerStr = (options?.provider || 'openai').toLowerCase();
    
    if (providerStr === 'anthropic') {
      const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
      return anthropic(options?.model || 'claude-3-5-sonnet-20241022');
    }
    
    // Default to OpenAI
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    return openai(options?.model || 'gpt-4o');
  }

  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    return retryWithBackoff(async () => {
      const { text } = await generateText({
        model: this.getModel(options),
        prompt,
        temperature: options?.temperature ?? 0.3,
        maxTokens: options?.maxTokens,
      });
      return text;
    });
  }

  async completeObject<T>(prompt: string, schema: z.Schema<T>, options?: LLMOptions): Promise<T> {
    return retryWithBackoff(async () => {
      const { object } = await generateObject({
        model: this.getModel(options),
        prompt,
        schema,
        temperature: options?.temperature ?? 0.1,
      });
      return object;
    });
  }
}
