import { getFilledPrompt } from './prompts';
import { LLMClient, LLMOptions } from '../clients/llm';
import { WikipediaClient } from '../clients/wikipedia';
import { z } from 'zod';

export class ConversionModule {
  private llmClient: LLMClient;
  private wikiClient: WikipediaClient;

  constructor(options?: LLMOptions) {
    this.llmClient = new LLMClient();
    this.wikiClient = new WikipediaClient();
  }

  async applyConversionGroups(
    translatedWikitext: string,
    llmOptions?: LLMOptions
  ): Promise<string> {
    // 1. Fetch Conversion Groups
    const groups = await this.wikiClient.getConversionGroups();
    const groupListStr = groups.map(g => `- ${g.name} (${g.category})`).join('\n');

    const prompt = getFilledPrompt('conversion-analysis', {
      conversion_group_list: groupListStr,
    });

    const fullPrompt = `${prompt}\n\nArticle content:\n${translatedWikitext.substring(0, 4000)}`;

    try {
      const applicableGroups = await this.llmClient.completeObject<string[]>(
        fullPrompt, 
        z.array(z.string()), 
        llmOptions
      );

      if (applicableGroups && applicableGroups.length > 0) {
        // Insert {{NoteTA}} template at article top with conversion groups:
        // Format: {{NoteTA|G1=IT|G2=Geography|...}}
        const args = applicableGroups.map((g, i) => `G${i + 1}=${g}`).join('|');
        return `{{NoteTA|${args}}}\n` + translatedWikitext;
      }
    } catch (err) {
      console.warn("Conversion Module: Failed to determine groups, skipping...", err);
    }
    
    return translatedWikitext;
  }
}
