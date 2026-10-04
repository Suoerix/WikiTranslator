import { z } from 'zod';

export const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  GOOGLE_BASE_URL: z.string().optional(),
  WIKIPEDIA_USER_AGENT: z.string().default('WikiTranslator/1.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SESSION_DIR: z.string().default('.wiki-translator/sessions'),
  LLM_DEBUG: z.string().optional(),
  LLM_LOG_DIR: z.string().default('llm-logs'),
  LLM_THINKING_BUDGET: z.string().optional(),
  LLM_MAX_TOKENS: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  return EnvSchema.parse(process.env);
}
