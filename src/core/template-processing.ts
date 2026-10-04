import { TemplateParser } from '../parsers/template';
import { WikipediaClient } from '../clients/wikipedia';
import { PlaceholderHelper } from '../utils/placeholder';

export class TemplateProcessingModule {
  private wikiClient: WikipediaClient;

  constructor(options?: any, wikiClient?: WikipediaClient) {
    this.wikiClient = wikiClient || new WikipediaClient();
  }

  private getPrefixedName(name: string): string {
    // If name already has a namespace (e.g. Wikipedia:, User:, Template:), use as is.
    // Check if it starts with word characters followed by a colon.
    if (/^[A-Za-z\u00C0-\u017F0-9_ -]+:/i.test(name)) {
      return name;
    }
    return `Template:${name}`;
  }

  /**
   * Resolve template redirects to their canonical names via API.
   * Uses action=query&titles=...&redirects to batch-resolve.
   */
  private async resolveRedirects(
    templateNames: string[],
    sourceLang: string
  ): Promise<Map<string, string>> {
    if (templateNames.length === 0) return new Map();

    const prefixed = templateNames.map(n => this.getPrefixedName(n));
    const resolvedMap = await this.wikiClient.resolveRedirects(sourceLang, prefixed);
    
    const result = new Map<string, string>();
    for (const [originalPrefixed, resolvedPrefixed] of resolvedMap.entries()) {
      const original = originalPrefixed.replace(/^Template:/i, '');
      const resolved = resolvedPrefixed.replace(/^Template:/i, '');
      if (original !== resolved) {
        result.set(original, resolved);
      }
    }
    return result;
  }

  async processTemplates(
    wikitext: string,
    placeholderMap: Map<string, string>,
    sourceLang: string = 'en',
    templateOverrides?: Map<string, string>
  ): Promise<string> {
    let result = wikitext;

    // 1. Extract Template Names
    const templates = TemplateParser.extractTemplates(result);
    const templateNames = Array.from(new Set(templates.map(t => t.name)));

    // 2. Resolve redirects to canonical names
    const redirectMap = await this.resolveRedirects(templateNames, sourceLang);

    // 3. Build translation map: canonical name → Chinese name
    const translationMap = new Map<string, string>();

    // Determine which names still need Wikidata lookup
    const needWikidataLookup: string[] = [];
    for (const name of templateNames) {
      const canonical = redirectMap.get(name) || name;
      // Check override table first (using canonical name)
      if (templateOverrides?.has(canonical)) {
        translationMap.set(name, templateOverrides.get(canonical)!);
      } else if (templateOverrides?.has(name)) {
        // Also try the original name in overrides
        translationMap.set(name, templateOverrides.get(name)!);
      } else {
        needWikidataLookup.push(name);
      }
    }

    // 4. Query Wikidata for remaining templates (using canonical names)
    if (needWikidataLookup.length > 0) {
      const prefixedNames = needWikidataLookup.map(n => {
        const canonical = redirectMap.get(n) || n;
        return this.getPrefixedName(canonical);
      });
      const langlinks = await this.wikiClient.getLangLinks(sourceLang, prefixedNames, 'zh');

      for (let i = 0; i < needWikidataLookup.length; i++) {
        const originalName = needWikidataLookup[i];
        const canonical = redirectMap.get(originalName) || originalName;
        const prefixed = this.getPrefixedName(canonical);
        const zhPrefixed = langlinks.get(prefixed);
        if (zhPrefixed) {
          // Only strip 'Template:' if the original didn't have a specific namespace
          translationMap.set(originalName, zhPrefixed.replace(/^Template:/i, ''));
        }
      }
    }

    // 5. Replace template names in wikitext
    if (translationMap.size > 0) {
      for (const t of templates) {
        const zhName = translationMap.get(t.name);
        if (zhName) {
          result = result.replace(`{{${t.name}`, `{{${zhName}`);
        }
      }
    }

    // 6. Restore Placeholders
    for (const [placeholder, original] of placeholderMap.entries()) {
      if (PlaceholderHelper.isPlaceholder(placeholder)) {
        result = result.replace(placeholder, () => original);
      }
    }

    return result;
  }
}
