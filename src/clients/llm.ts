import { streamText, LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { loadEnv } from "../config/env";
import { DEFAULTS } from "../config/defaults";
import { retryWithBackoff } from "../utils/retry";
import { createStreamPresenter } from "../utils/stream-presenter";
import { z } from "zod";
import type { ZodTypeAny } from "zod";
import fs from "fs";
import path from "path";

export interface LLMOptions {
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  debugLabel?: string;
}

interface LLMDebugRecord {
  label: string;
  timestamp: string;
  provider: string;
  model: string;
  attempt: number;
  durationMs: number;
  request: {
    prompt: string;
    temperature?: number;
    maxTokens?: number;
    thinkingBudget?: number;
  };
  response: {
    reasoning?: string;
    text?: string;
    object?: unknown;
    usage?: { promptTokens?: number; completionTokens?: number };
    finishReason?: string;
  };
  error?: string;
}

type StreamEvent =
  | { type: "reasoning"; delta: string }
  | { type: "text"; delta: string }
  | { type: "finish"; finishReason?: string; usage?: { promptTokens?: number; completionTokens?: number } };

/**
 * Build a plain-JSON description of a zod schema to inject into the prompt,
 * so the model returns a JSON object matching it.
 */
function schemaHint(schema: ZodTypeAny): unknown {
  const def: any = schema._def;
  switch (def.typeName) {
    case 'ZodString':
      return schema.description || 'string';
    case 'ZodNumber':
      return schema.description || 'number';
    case 'ZodBoolean':
      return schema.description || 'boolean';
    case 'ZodArray':
      return [schemaHint(def.type)];
    case 'ZodObject': {
      const obj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(def.shape() as Record<string, ZodTypeAny>)) {
        obj[key] = schemaHint(value);
      }
      return obj;
    }
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
      return schemaHint(def.innerType);
    default:
      return schema.description || 'any';
  }
}

/**
 * Extract and validate a JSON object from raw LLM output.
 * Throws on failure so retryWithBackoff can retry the request.
 */
function parseStructuredOutput<T>(text: string, schema: z.Schema<T>): T {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();

  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in LLM response');
  }
  const candidate = t.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (e: any) {
    throw new Error(`Invalid JSON in LLM response: ${e.message}`);
  }
  const check = schema.safeParse(parsed);
  if (!check.success) {
    throw new Error(`Schema validation failed: ${check.error.message}`);
  }
  return check.data;
}

/**
 * True for API errors that retrying cannot fix (auth, bad request, model not
 * found...). 408/429 and 5xx stay retryable.
 */
function isNonRetryableApiError(err: any): boolean {
  const status = err?.statusCode ?? err?.status;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * Build a diagnostic description for a failed attempt, keeping the original
 * message and adding what the stream had produced before failing.
 */
function describeFailure(err: any, sink: { reasoning: string; text: string; finishReason?: string }, durationMs: number): string {
  const parts = [err.message];
  parts.push(`stream ended after ${(durationMs / 1000).toFixed(1)}s with reasoning: ${sink.reasoning.length} chars, text: ${sink.text.length} chars, finishReason: ${sink.finishReason ?? "none"}`);
  if (sink.finishReason === "length") {
    parts.push(`output was cut by max_tokens — increase LLM_MAX_TOKENS`);
  } else if (!sink.finishReason && (sink.reasoning.length > 0 || sink.text.length > 0)) {
    parts.push(`stream was likely cut off by the server/gateway before the model finished — retrying is reasonable`);
  }
  return parts.join(" | ");
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
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      });
    }

    // Default to OpenAI-compatible endpoints (official API, mirrors, DeepSeek, ...)
    // Uses @ai-sdk/openai-compatible which handles the non-standard
    // `reasoning_content` stream field emitted by hybrid reasoning models.
    const openai = createOpenAICompatible({
      name: "openai",
      baseURL: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: env.OPENAI_API_KEY,
    });
    return openai.chatModel(options?.model || "gpt-4o");
  }

  /**
   * Extended thinking configuration (Anthropic). Enabled via LLM_THINKING_BUDGET env.
   */
  private getThinkingOptions(providerStr: string): { providerOptions?: any; budgetTokens?: number; temperatureOverride?: number } {
    const env = loadEnv();
    const budget = env.LLM_THINKING_BUDGET ? parseInt(env.LLM_THINKING_BUDGET, 10) : NaN;
    if (!Number.isFinite(budget) || budget <= 0 || providerStr !== "anthropic") {
      return {};
    }
    return {
      providerOptions: {
        anthropic: { thinking: { type: "enabled", budgetTokens: budget } },
      },
      budgetTokens: budget,
      // Anthropic requires temperature=1 when thinking is enabled
      temperatureOverride: 1,
    };
  }

  private saveDebugLog(record: LLMDebugRecord): void {
    try {
      const env = loadEnv();
      if (env.LLM_DEBUG !== "true") return;
      const dir = env.LLM_LOG_DIR || "llm-logs";
      fs.mkdirSync(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
      const safeLabel = (record.label || "llm").replace(/[^\w.-]+/g, "_").slice(0, 80);
      const file = path.join(dir, `${ts}_${safeLabel}_attempt${record.attempt}.json`);
      fs.writeFileSync(file, JSON.stringify(record, null, 2));
      console.log(`[LLM] Debug log saved to ${file}`);
    } catch (e: any) {
      console.error(`[LLM] Failed to save debug log: ${e.message}`);
    }
  }

  /**
   * @ai-sdk based streaming for all providers, mapped to a common event shape.
   * With @ai-sdk/openai-compatible, the `reasoning_content` deltas from hybrid
   * reasoning models (DeepSeek, Qwen...) arrive as `reasoning` chunks.
   */
  private async *sdkEvents(
    prompt: string,
    options: LLMOptions | undefined,
    signal: AbortSignal,
    temperature: number,
    providerOptions: any | undefined,
    maxTokens: number | undefined,
  ): AsyncGenerator<StreamEvent> {
    const result = streamText({
      model: this.getModel(options),
      prompt,
      temperature,
      maxTokens,
      abortSignal: signal,
      ...(providerOptions ? { providerOptions } : {}),
    });
    for await (const chunk of result.fullStream) {
      if (chunk.type === "reasoning") {
        yield { type: "reasoning", delta: chunk.textDelta };
      } else if (chunk.type === "text-delta") {
        yield { type: "text", delta: chunk.textDelta };
      } else if (chunk.type === "finish") {
        yield { type: "finish", finishReason: chunk.finishReason, usage: chunk.usage };
      } else if (chunk.type === "error") {
        throw chunk.error;
      }
    }
  }

  /**
   * Unified streaming entry point for all providers.
   */
  private async *streamEvents(
    prompt: string,
    options: LLMOptions | undefined,
    signal: AbortSignal,
    defaultTemperature: number,
  ): AsyncGenerator<StreamEvent> {
    const providerStr = (options?.provider || "openai").toLowerCase();
    const env = loadEnv();
    const thinking = this.getThinkingOptions(providerStr);
    const temperature = thinking.temperatureOverride ?? options?.temperature ?? defaultTemperature;

    // Output budget: hybrid reasoning models spend a large share of the output
    // tokens on thinking; a small implicit server-side default can exhaust the
    // budget mid-thought and truncate the body.
    // LLM_MAX_TOKENS = <number> | "none"/"0" (omit the field, let the server decide)
    const raw = (env.LLM_MAX_TOKENS ?? "").trim();
    let maxTokens: number | undefined;
    if (/^(none|off|0)$/i.test(raw)) {
      maxTokens = options?.maxTokens; // omit max_tokens entirely
    } else {
      const parsed = raw ? parseInt(raw, 10) : NaN;
      maxTokens = options?.maxTokens ?? (Number.isFinite(parsed) ? parsed : 8192);
    }
    // Anthropic requires max_tokens > thinking budget, leaving room for the body
    if (thinking.budgetTokens && (maxTokens === undefined || maxTokens <= thinking.budgetTokens)) {
      maxTokens = thinking.budgetTokens + 8192;
    }

    yield* this.sdkEvents(prompt, options, signal, temperature, thinking.providerOptions, maxTokens);
  }

  /**
   * Consume stream events: print reasoning + text to the terminal via the
   * line-buffered presenter, and collect pieces into `sink`.
   * The sink is provided by the caller so partial data survives stream errors.
   */
  private async consumeEvents(
    events: AsyncGenerator<StreamEvent>,
    presenter: ReturnType<typeof createStreamPresenter>,
    sink: { reasoning: string; text: string; usage?: any; finishReason?: string },
  ): Promise<void> {
    for await (const ev of events) {
      if (ev.type === "reasoning") {
        sink.reasoning += ev.delta;
        presenter.present(ev.delta, "reasoning");
      } else if (ev.type === "text") {
        sink.text += ev.delta;
        presenter.present(ev.delta, "text");
      } else if (ev.type === "finish") {
        sink.usage = ev.usage;
        sink.finishReason = ev.finishReason;
      }
    }
    presenter.finish();
  }

  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    let attempt = 0;
    return retryWithBackoff(
      async () => {
        attempt++;
        const startTime = Date.now();
        const providerStr = (options?.provider || "openai").toLowerCase();
        console.log(
          `[LLM] Request starting (Attempt ${attempt}, length: ${prompt.length})`,
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout

        const presenter = createStreamPresenter();
        const thinking = this.getThinkingOptions(providerStr);
        const sink: { reasoning: string; text: string; usage?: any; finishReason?: string } = { reasoning: "", text: "" };

        try {
          await this.consumeEvents(
            this.streamEvents(prompt, options, controller.signal, 0.3),
            presenter,
            sink,
          );
          clearTimeout(timeoutId);
          const duration = Date.now() - startTime;
          console.log(
            `[LLM] Request finished in ${(duration / 1000).toFixed(1)}s. Tokens: ${sink.usage?.promptTokens ?? "?"} in, ${sink.usage?.completionTokens ?? "?"} out`,
          );

          this.saveDebugLog({
            label: options?.debugLabel || "complete",
            timestamp: new Date().toISOString(),
            provider: providerStr,
            model: options?.model || "",
            attempt,
            durationMs: duration,
            request: {
              prompt,
              temperature: options?.temperature,
              maxTokens: options?.maxTokens,
              thinkingBudget: thinking.budgetTokens,
            },
            response: { ...sink },
          });

          return sink.text;
        } catch (err: any) {
          clearTimeout(timeoutId);
          presenter.finish();
          const duration = Date.now() - startTime;
          const description = describeFailure(err, sink, duration);
          console.error(
            `[LLM] Request failed after ${(duration / 1000).toFixed(1)}s: ${description}`,
          );

          this.saveDebugLog({
            label: (options?.debugLabel || "complete") + "_FAILED",
            timestamp: new Date().toISOString(),
            provider: providerStr,
            model: options?.model || "",
            attempt,
            durationMs: duration,
            request: {
              prompt,
              temperature: options?.temperature,
              maxTokens: options?.maxTokens,
              thinkingBudget: thinking.budgetTokens,
            },
            response: { ...sink },
            error: description,
          });

          throw new Error(description, { cause: err });
        }
      },
      DEFAULTS.apiRetries,
      DEFAULTS.apiRetryBaseDelay,
      (err) => !isNonRetryableApiError(err.cause ?? err),
    );
  }

  async completeObject<T>(
    prompt: string,
    schema: z.Schema<T>,
    options?: LLMOptions,
  ): Promise<T> {
    let attempt = 0;
    return retryWithBackoff(
      async () => {
        attempt++;
        const startTime = Date.now();
        const providerStr = (options?.provider || "openai").toLowerCase();
        const baseLabel = options?.debugLabel || "structured";
        console.log(
          `[LLM] Structured request starting (Attempt ${attempt}, label: ${baseLabel}, length: ${prompt.length})`,
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 min timeout — long thinking is allowed

        const presenter = createStreamPresenter();
        const thinking = this.getThinkingOptions(providerStr);
        const sink: { reasoning: string; text: string; usage?: any; finishReason?: string } = { reasoning: "", text: "" };

        const structuredPrompt =
          `${prompt}\n\nReturn ONLY a valid JSON object (no markdown fences, no extra text) ` +
          `matching exactly this structure:\n${JSON.stringify(schemaHint(schema), null, 2)}`;

        try {
          await this.consumeEvents(
            this.streamEvents(structuredPrompt, options, controller.signal, 0.1),
            presenter,
            sink,
          );
          clearTimeout(timeoutId);

          const object = parseStructuredOutput(sink.text, schema);

          const duration = Date.now() - startTime;
          console.log(
            `[LLM] Structured request finished in ${(duration / 1000).toFixed(1)}s. Reason: ${sink.finishReason}. Tokens: ${sink.usage?.promptTokens ?? "?"} in, ${sink.usage?.completionTokens ?? "?"} out`,
          );

          this.saveDebugLog({
            label: baseLabel,
            timestamp: new Date().toISOString(),
            provider: providerStr,
            model: options?.model || "",
            attempt,
            durationMs: duration,
            request: {
              prompt: structuredPrompt,
              temperature: options?.temperature,
              maxTokens: options?.maxTokens,
              thinkingBudget: thinking.budgetTokens,
            },
            response: { ...sink, object },
          });

          return object;
        } catch (err: any) {
          clearTimeout(timeoutId);
          presenter.finish();
          const duration = Date.now() - startTime;
          const description = describeFailure(err, sink, duration);
          console.error(
            `[LLM] Structured request failed after ${(duration / 1000).toFixed(1)}s: ${description}`,
          );

          this.saveDebugLog({
            label: baseLabel + "_FAILED",
            timestamp: new Date().toISOString(),
            provider: providerStr,
            model: options?.model || "",
            attempt,
            durationMs: duration,
            request: {
              prompt: structuredPrompt,
              temperature: options?.temperature,
              maxTokens: options?.maxTokens,
              thinkingBudget: thinking.budgetTokens,
            },
            response: { ...sink },
            error: description,
          });

          throw new Error(description, { cause: err });
        }
      },
      DEFAULTS.apiRetries,
      DEFAULTS.apiRetryBaseDelay,
      (err) => !isNonRetryableApiError(err.cause ?? err),
    );
  }
}
