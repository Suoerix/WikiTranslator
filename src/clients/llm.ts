import { generateText, generateObject, LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { loadEnv } from "../config/env";
import { retryWithBackoff } from "../utils/retry";
import { z } from "zod";

export interface LLMOptions {
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
}

export class LLMClient {
  private getModel(options?: LLMOptions): LanguageModel {
    const env = loadEnv();
    const providerStr = (options?.provider || "openai").toLowerCase();

    if (providerStr === "anthropic") {
      const anthropic = createAnthropic({
        apiKey: env.ANTHROPIC_API_KEY,
        baseURL: env.ANTHROPIC_BASE_URL,
      });
      return anthropic(options?.model || "claude-3-5-sonnet-20241022");
    }

    if (providerStr === "google") {
      const google = createGoogleGenerativeAI({
        apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
        baseURL: env.GOOGLE_BASE_URL,
      });
      return google(options?.model || "gemini-1.5-flash", {
        safetySettings: [
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_NONE",
          },
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_NONE",
          },
        ],
      });
    }

    // Default to OpenAI
    const openai = createOpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL,
    });
    return openai(options?.model || "gpt-4o");
  }

  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    let attempt = 0;
    return retryWithBackoff(async () => {
      attempt++;
      const startTime = Date.now();
      console.log(
        `[LLM] Request starting (Attempt ${attempt}, length: ${prompt.length})`,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout

      try {
        const { text, usage } = await generateText({
          model: this.getModel(options),
          prompt,
          temperature: options?.temperature ?? 0.3,
          maxTokens: options?.maxTokens,
          abortSignal: controller.signal,
        });

        clearTimeout(timeoutId);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          `[LLM] Request finished in ${duration}s. Tokens: ${usage.promptTokens} in, ${usage.completionTokens} out`,
        );
        return text;
      } catch (err: any) {
        clearTimeout(timeoutId);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(
          `[LLM] Request failed after ${duration}s: ${err.message}`,
        );
        throw err;
      }
    });
  }

  async completeObject<T>(
    prompt: string,
    schema: z.Schema<T>,
    options?: LLMOptions,
  ): Promise<T> {
    let attempt = 0;
    return retryWithBackoff(async () => {
      attempt++;
      const startTime = Date.now();
      console.log(
        `[LLM] Structured request starting (Attempt ${attempt}, length: ${prompt.length})`,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 min timeout

      try {
        const providerStr = (options?.provider || "openai").toLowerCase();

        console.log(`[LLM] Calling generateObject...`);
        const { object, usage, finishReason } = await generateObject({
          model: this.getModel(options),
          prompt,
          schema,
          mode: 'json',
          temperature: options?.temperature ?? 0.1,
          abortSignal: controller.signal,
        });

        clearTimeout(timeoutId);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          `[LLM] Structured request finished in ${duration}s. Reason: ${finishReason}. Tokens: ${usage.promptTokens} in, ${usage.completionTokens} out`,
        );
        return object;
      } catch (err: any) {
        clearTimeout(timeoutId);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        if (
          err.message?.includes("content-filter") ||
          err.finishReason === "content-filter"
        ) {
          console.error(
            `[LLM] Request BLOCKED by Gemini safety filter. You may need to use a different model or adjust the content.`,
          );
        }

        console.error(
          `[LLM] Structured request failed after ${duration}s: ${err.message}`,
        );
        throw err;
      }
    });
  }
}
