import { z } from 'zod';

export const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  WIKIPEDIA_USER_AGENT: z.string().default('WikiTranslator/1.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SESSION_DIR: z.string().default('.wiki-translator/sessions'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  return EnvSchema.parse(process.env);
}
