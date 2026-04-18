import fs from 'fs';
import path from 'path';

/* PROMPTS_PLACEHOLDER */

export function getPrompt(name: string): string {
  // @ts-ignore
  if (typeof EMBEDDED_PROMPTS !== 'undefined' && name in EMBEDDED_PROMPTS) {
    // @ts-ignore
    return EMBEDDED_PROMPTS[name];
  }

  const promptPath = path.resolve(process.cwd(), 'src/core/prompts', `${name}.md`);
  if (fs.existsSync(promptPath)) {
    return fs.readFileSync(promptPath, 'utf-8');
  }

  throw new Error(`Prompt not found: ${name}`);
}

export function fillPrompt(
  template: string,
  values: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

export function getFilledPrompt(
  name: string,
  values: Record<string, string>
): string {
  const template = getPrompt(name);
  return fillPrompt(template, values);
}
