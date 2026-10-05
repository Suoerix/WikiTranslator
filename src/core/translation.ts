import { getFilledPrompt } from './prompts';
import { LLMClient, LLMOptions } from '../clients/llm';
import { WikipediaClient } from '../clients/wikipedia';
import { z } from 'zod';

export class TranslationModule {
  private llmClient: LLMClient;
  private wikiClient: WikipediaClient;

  constructor(options?: LLMOptions, wikiClient?: WikipediaClient) {
    this.llmClient = new LLMClient();
    this.wikiClient = wikiClient || new WikipediaClient();
  }

  private formatGlossary(glossary?: Record<string, string>): string {
    if (!glossary || Object.keys(glossary).length === 0) return 'None';
    return Object.entries(glossary).map(([k, v]) => `${k}: ${v}`).join('\n');
  }

  async translate(
    wikitext: string,
    sourceLang: string = 'en',
    glossary?: Record<string, string>,
    styleGuide?: string,
    llmOptions?: LLMOptions
  ): Promise<string> {
    const prompt = getFilledPrompt('translation', {
      source_lang: sourceLang,
      glossary_terms: this.formatGlossary(glossary),
      style_guide_rules: styleGuide || 'None',
    });
    
    const fullPrompt = `${prompt}\n\nWikitext to translate:\n${wikitext}`;

    return this.llmClient.complete(fullPrompt, llmOptions);
  }

  /**
   * Structured translation: translates title and body in a single LLM call.
   * Returns structured output with separate translatedTitle and translatedBody fields.
   */
  async translateStructured(
    content: { title: string; body: string },
    prompt: string,
    glossary?: Record<string, string>,
    additionalPrompt?: string,
    llmOptions?: LLMOptions
  ): Promise<{ translatedTitle: string; translatedBody: string }> {
    const glossaryStr = this.formatGlossary(glossary);

    let fullPrompt = prompt
      .replace(/\{glossary_terms\}/g, glossaryStr)
      .replace(/\{additional_prompt\}/g, additionalPrompt || '');

    fullPrompt += `\n\nPlease translate the following title and body. Return a JSON object with "translatedTitle" and "translatedBody" fields.\n\nTitle to translate:\n${content.title}\n\nBody to translate:\n${content.body}`;

    const schema = z.object({
      translatedTitle: z.string().describe('The translated title in Simplified Chinese'),
      translatedBody: z.string().describe('The translated body wikitext in Simplified Chinese'),
    });

    return this.llmClient.completeObject(fullPrompt, schema, llmOptions);
  }

  /**
   * Generic structured request: takes an arbitrary zod schema.
   * The JSON output instruction is appended by the LLM client.
   */
  async completeStructured<T>(
    prompt: string,
    schema: z.Schema<T>,
    llmOptions?: LLMOptions
  ): Promise<T> {
    return this.llmClient.completeObject(prompt, schema, llmOptions);
  }

  /**
   * Body-only structured translation for continuation chunks.
   * Only asks for translatedBody — no title, saving tokens and avoiding
   * spurious translated titles like "（续）".
   */
  async translateBodyOnly(
    body: string,
    prompt: string,
    glossary?: Record<string, string>,
    additionalPrompt?: string,
    llmOptions?: LLMOptions
  ): Promise<string> {
    const glossaryStr = this.formatGlossary(glossary);

    let fullPrompt = prompt
      .replace(/\{glossary_terms\}/g, glossaryStr)
      .replace(/\{additional_prompt\}/g, additionalPrompt || '');

    fullPrompt += `\n\nPlease translate the following body. Return a JSON object with only a "translatedBody" field.\n\nBody to translate:\n${body}`;

    const schema = z.object({
      translatedBody: z.string().describe('The translated body wikitext in Simplified Chinese'),
    });

    const result = await this.llmClient.completeObject(fullPrompt, schema, llmOptions);
    return result.translatedBody;
  }
}
