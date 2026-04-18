import { TemplateParser } from '../parsers/template';
import { WikipediaClient } from '../clients/wikipedia';
import { PlaceholderHelper } from '../utils/placeholder';

export class TemplateProcessingModule {
  private wikiClient: WikipediaClient;

  constructor() {
    this.wikiClient = new WikipediaClient();
  }

  async processTemplates(
    wikitext: string,
    placeholderMap: Map<string, string>,
    sourceLang: string = 'en'
  ): Promise<string> {
    let result = wikitext;

    // 1. Extract Template Names for translation
    // Without explicitly requested, we only translate template names or just pass them through.
    const templates = TemplateParser.extractTemplates(result);
    const templateNames = Array.from(new Set(templates.map(t => t.name)));

    const translationMap = new Map<string, string>();
    if (templateNames.length > 0) {
      // Query Wikipedia API for Template equivalents
      const prefixedNames = templateNames.map(n => `Template:${n}`);
      const langlinks = await this.wikiClient.getLangLinks(sourceLang, prefixedNames, 'zh');
      
      for (const [originalPrefixed, zhPrefixed] of langlinks.entries()) {
        const originalName = originalPrefixed.replace(/^Template:/i, '');
        if (zhPrefixed) {
          translationMap.set(originalName, zhPrefixed.replace(/^Template:/i, ''));
        }
      }
    }

    // Replace template names
    if (translationMap.size > 0) {
      for (const t of templates) {
        const zhName = translationMap.get(t.name);
        if (zhName) {
          // A bit simplistic for MVP: assume no nested complex overlaps or use a safe replacer
          // Ideally replacing exact substring at positions but since we don't track text mutations cleanly yet:
          result = result.replace(`{{${t.name}`, `{{${zhName}`);
        }
      }
    }

    // 2. Restore Placeholders
    // Iterate placeholder map and replace back
    for (const [placeholder, original] of placeholderMap.entries()) {
      if (PlaceholderHelper.isPlaceholder(placeholder)) {
        result = result.replace(placeholder, () => original); // use function to avoid $ replacement issues
      }
    }

    return result;
  }
}
