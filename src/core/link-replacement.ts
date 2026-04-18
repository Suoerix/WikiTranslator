import { LinkReplacementResult } from '../types/modules';
import { Category } from '../types/wikitext';
import { LinkParser } from '../parsers/link';
import { WikipediaClient } from '../clients/wikipedia';
import { DEFAULTS } from '../config/defaults';

export class LinkReplacementModule {
  private wikiClient: WikipediaClient;

  constructor() {
    this.wikiClient = new WikipediaClient();
  }

  private makeLink(
    target: string,
    display: string | undefined,
    chineseTarget: string | null | undefined,
    sourceLang: string
  ): string {
    const isPiped = display && display !== target;
    const dispStr = display ? (isPiped ? `|${display}` : '') : '';

    if (chineseTarget === null) {
      if (DEFAULTS.useTslTemplate) {
        return isPiped
          ? `{{tsl|${sourceLang}|${target}||${display}}}`
          : `{{tsl|${sourceLang}|${target}|}}`;
      } else {
        return isPiped
          ? `{{link-${sourceLang}||${target}|${display}}}`
          : `{{link-${sourceLang}||${target}}}`;
      }
    } else if (chineseTarget === undefined) {
      // original doesn't exist? Just keep original
      return `[[${target}${dispStr}]]`;
    } else {
      let finalLink = '';
      if (DEFAULTS.keepOriginalDisplay && isPiped) {
        finalLink = `[[${chineseTarget}|${display}]]`;
      } else {
        finalLink = `[[${chineseTarget}]]`;
      }
      
      if (finalLink.includes('|') && finalLink.startsWith('[[') && finalLink.endsWith(']]')) {
        const parts = finalLink.slice(2, -2).split('|');
        if (parts.length === 2 && parts[0] === parts[1]) {
          finalLink = `[[${parts[0]}]]`;
        }
      }
      return finalLink;
    }
  }

  private appendCategories(wikitext: string, categories: Category[]): string {
    if (categories.length === 0) return wikitext;
    
    const categoryLines = categories.map(cat => {
      if (cat.sortKey) {
        return `[[Category:${cat.name}|${cat.sortKey}]]`;
      } else {
        return `[[Category:${cat.name}]]`;
      }
    });

    return wikitext + '\n\n' + categoryLines.join('\n');
  }

  async replaceLinks(
    wikitext: string,
    removedCategories: Category[],
    sourceLang: string = 'en'
  ): Promise<LinkReplacementResult> {
    const links = LinkParser.extractLinks(wikitext);
    const uniqueLinkTargets = Array.from(new Set(links.map(l => l.target)));

    const translationMap = new Map<string, string>();
    if (uniqueLinkTargets.length > 0) {
      const langlinks = await this.wikiClient.getLangLinks(sourceLang, uniqueLinkTargets, 'zh');
      for (const [original, zh] of langlinks.entries()) {
        translationMap.set(original, zh); // zh is '' if not found
      }
    }

    let statsReplaced = 0;
    let statsTsl = 0;
    let result = wikitext;

    // Process from end to start to avoid position shifts if we tracked positions,
    // but without reliable positions after translation, we'll use regex replacer carefully:
    for (const link of links) {
      const zhTarget = translationMap.get(link.target);
      let newLinkText = '';

      if (zhTarget === '') {
        newLinkText = this.makeLink(link.target, link.display, null, sourceLang);
        statsTsl++;
      } else if (zhTarget) {
        newLinkText = this.makeLink(link.target, link.display, zhTarget, sourceLang);
        statsReplaced++;
      } else {
        newLinkText = this.makeLink(link.target, link.display, undefined, sourceLang);
      }

      // simplistic replace for MVP since AST positions on translated text are lost:
      // Note: this assumes we translate [[target|display]] pattern correctly without breaking original targets. 
      // Safe fallback replacing exactly [[target]] or [[target|display]]
      const originalPattern = `[[${link.target}${link.display ? `|${link.display}` : ''}]]`;
      result = result.replace(originalPattern, newLinkText);
    }

    // Now categories
    const translatedCategories: Category[] = [];
    if (removedCategories.length > 0) {
      const catNames = removedCategories.map(c => `Category:${c.name}`);
      const catLanglinks = await this.wikiClient.getLangLinks(sourceLang, catNames, 'zh');
      
      for (const cat of removedCategories) {
        const zh = catLanglinks.get(`Category:${cat.name}`);
        if (zh) {
          translatedCategories.push({
            name: zh.replace(/^Category:/i, '').replace(/^分类:/i, ''),
            sortKey: cat.sortKey
          });
        }
      }
    }

    result = this.appendCategories(result, translatedCategories);

    return {
      wikitext: result,
      translatedCategories,
      linkStats: {
        totalLinks: links.length,
        replacedLinks: statsReplaced,
        tslLinks: statsTsl
      }
    };
  }
}
