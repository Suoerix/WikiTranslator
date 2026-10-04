import { LinkReplacementResult } from '../types/modules';
import { LinkReplacementOptions } from '../types/config';
import { Category } from '../types/wikitext';
import { LinkParser } from '../parsers/link';
import { WikipediaClient } from '../clients/wikipedia';
import { DEFAULTS } from '../config/defaults';

export class LinkReplacementModule {
  private wikiClient: WikipediaClient;

  constructor(wikiClient?: WikipediaClient) {
    this.wikiClient = wikiClient || new WikipediaClient();
  }

  /**
   * Determine if a link target belongs to a given namespace.
   */
  private getNamespace(target: string): { namespace: string; rest: string } | null {
    const colonIdx = target.indexOf(':');
    if (colonIdx <= 0) return null;
    const ns = target.substring(0, colonIdx);
    const rest = target.substring(colonIdx + 1);
    return { namespace: ns, rest };
  }

  /**
   * Check if a link is a transwiki or special link (starts with :)
   */
  private isTranswikiLink(target: string): boolean {
    return target.startsWith(':');
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
    sourceLang: string = 'en',
    options?: LinkReplacementOptions
  ): Promise<LinkReplacementResult> {
    const links = LinkParser.extractLinks(wikitext);
    const uniqueLinkTargets = Array.from(new Set(links.map(l => l.target)));

    // Partition links based on namespace rules
    const needLookup: string[] = [];
    const skipSet = new Set<string>();      // Links to keep as-is
    const prefixMap = new Map<string, string>(); // Links to prefix

    for (const target of uniqueLinkTargets) {
      // Skip placeholders (e.g. @@IW:0@@, @@EL:1@@)
      if (target.match(/^@@[A-Z]+:\d+@@$/)) {
        skipSet.add(target);
        continue;
      }

      // Check transwiki (any link starting with : is considered transwiki/special)
      if (options?.skipTranswiki && this.isTranswikiLink(target)) {
        skipSet.add(target);
        continue;
      }

      const ns = this.getNamespace(target);
      if (ns) {
        // Check skipNamespaces
        if (options?.skipNamespaces?.includes(ns.namespace)) {
          skipSet.add(target);
          continue;
        }
        // Check prefixNamespaces
        if (options?.prefixNamespaces?.has(ns.namespace)) {
          const prefix = options.prefixNamespaces.get(ns.namespace)!;
          prefixMap.set(target, prefix);
          continue;
        }
      }

      // Normalise WP: alias → Wikipedia: for consistent Wikidata lookups
      const normalizedTarget = target.startsWith('WP:')
        ? 'Wikipedia:' + target.slice(3)
        : target;

      // Check task-specific path skips (provided via options)
      const shouldSkipPath = options?.skipPathPrefixes?.some(p => normalizedTarget.startsWith(p));
      if (shouldSkipPath) {
        skipSet.add(target);
        continue;
      }

      // Check linkOverrides (use normalized key too)
      if (options?.linkOverrides?.has(target) || options?.linkOverrides?.has(normalizedTarget)) {
        continue;
      }

      needLookup.push(normalizedTarget === target ? target : normalizedTarget);
      // Track alias mapping so we can restore the original target in the output
      if (normalizedTarget !== target) {
        (this as any)._wpAliasMap = (this as any)._wpAliasMap || new Map<string, string>();
        (this as any)._wpAliasMap.set(normalizedTarget, target);
      }
    }

    // Apply namespace shortening to wikitext before link replacement
    let result = wikitext;
    if (options?.shortenNamespaces) {
      for (const [longNs, shortNs] of options.shortenNamespaces.entries()) {
        // Replace in link targets: [[Wikipedia:X → [[WP:X
        result = result.replace(
          new RegExp(`\\[\\[${longNs}:`, 'g'),
          `[[${shortNs}:`
        );
      }
    }

    // Query Wikidata for links that need lookup
    const translationMap = new Map<string, string>();
    if (needLookup.length > 0) {
      const langlinks = await this.wikiClient.getLangLinks(sourceLang, needLookup, 'zh');
      for (const [original, zh] of langlinks.entries()) {
        translationMap.set(original, zh);
      }
      console.log(`[DEBUG] Link Translation Results:`, Object.fromEntries(translationMap));
    }

    let statsReplaced = 0;
    let statsTsl = 0;

    for (const link of links) {
      // Skip transwiki and skipped-namespace links
      if (skipSet.has(link.target)) continue;

      let newLinkText = '';

      // Handle prefixed namespaces (e.g. User: → :en:User:)
      if (prefixMap.has(link.target)) {
        const prefix = prefixMap.get(link.target)!;
        const targetWithoutNs = link.target.split(':').pop();
        const displayPart = link.display ? `|${link.display}` : `|${targetWithoutNs}`;
        newLinkText = `[[${prefix}${targetWithoutNs}${displayPart}]]`;
        statsReplaced++;
      }
      // Handle linkOverrides
      else if (options?.linkOverrides?.has(link.target)) {
        const zhTarget = options.linkOverrides.get(link.target)!;
        newLinkText = this.makeLink(link.target, link.display, zhTarget || null, sourceLang);
        if (zhTarget) statsReplaced++; else statsTsl++;
      }
      // Handle Wikidata results (also check normalized WP: → Wikipedia: alias)
      else {
        const normalizedKey = link.target.startsWith('WP:')
          ? 'Wikipedia:' + link.target.slice(3)
          : link.target;
        const zhTarget = translationMap.get(link.target) ?? translationMap.get(normalizedKey);
        if (zhTarget === '') {
          newLinkText = this.makeLink(link.target, link.display, null, sourceLang);
          statsTsl++;
        } else if (zhTarget) {
          newLinkText = this.makeLink(link.target, link.display, zhTarget, sourceLang);
          statsReplaced++;
        } else {
          newLinkText = this.makeLink(link.target, link.display, undefined, sourceLang);
        }
      }

      if (newLinkText) {
        const originalPattern = `[[${link.target}${link.display ? `|${link.display}` : ''}]]`;
        result = result.replace(originalPattern, newLinkText);
      }
    }

    // Categories
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
