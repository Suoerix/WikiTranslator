import { getFilledPrompt } from './prompts';
import { LLMClient, LLMOptions } from '../clients/llm';

export class TranslationModule {
  private llmClient: LLMClient;

  constructor(options?: LLMOptions) {
    this.llmClient = new LLMClient();
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
}
