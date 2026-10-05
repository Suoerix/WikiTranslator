import { LinkReplacementResult } from '../types/modules';
import { LinkReplacementOptions } from '../types/config';
import { Category } from '../types/wikitext';
import { LinkParser } from '../parsers/link';
import { WikipediaClient } from '../clients/wikipedia';
import { DEFAULTS } from '../config/defaults';

/** Common English Wikipedia non-main namespaces (lowercase). */
const EN_NON_MAIN_NAMESPACES = new Set([
  'talk', 'user', 'user talk', 'user wiki', 'user wiki talk', 'ut',
  'wikipedia', 'wikipedia talk', 'wp', 'wt', 'project', 'project talk',
  'file', 'file talk', 'image', 'image talk',
  'mediawiki', 'mediawiki talk', 'template', 'template talk', 't',
  'help', 'help talk', 'h', 'category', 'category talk', 'cat',
  'portal', 'portal talk', 'p', 'draft', 'draft talk',
  'timedtext', 'timedtext talk', 'module', 'module talk',
  'gadget', 'gadget talk', 'gadget definition', 'gadget definition talk',
  'special', 'media', 'topic', 'wikipedia_library', 'wl',
]);

/** Namespace alias → canonical name (for langlinks lookups). */
const NS_ALIAS_CANONICAL: Record<string, string> = {
  'wp': 'Wikipedia', 'wt': 'Wikipedia talk', 'project': 'Wikipedia', 'project talk': 'Wikipedia talk',
  'p': 'Portal', 'cat': 'Category', 't': 'Template', 'h': 'Help',
  'image': 'File', 'image talk': 'File talk', 'ut': 'User talk', 'wl': 'Wikipedia Library',
};

export class LinkReplacementModule {
  private wikiClient: WikipediaClient;

  constructor(wikiClient?: WikipediaClient) {
    this.wikiClient = wikiClient || new WikipediaClient();
  }

  /**
   * Determine if a link target starts with a namespace.
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

  /**
   * Normalize a namespace alias to its canonical form for lookups:
   * 'WP:Village pump' → 'Wikipedia:Village pump'
   */
  private normalizeNsAlias(target: string): string {
    const colonIdx = target.indexOf(':');
    if (colonIdx <= 0) return target;
    const ns = target.slice(0, colonIdx).toLowerCase();
    const canonical = NS_ALIAS_CANONICAL[ns];
    if (canonical && canonical.toLowerCase() !== ns) {
      return canonical + target.slice(colonIdx);
    }
    return target;
  }

  private isNonMainNamespace(target: string, extraNamespaces?: string[]): boolean {
    const ns = this.getNamespace(target);
    if (!ns) return false;
    const nsLower = ns.namespace.toLowerCase();
    if (EN_NON_MAIN_NAMESPACES.has(nsLower)) return true;
    if (extraNamespaces?.some(n => n.toLowerCase() === nsLower)) return true;
    return false;
  }

  private makeLink(
    target: string,
    display: string | undefined,
    chineseTarget: string | null | undefined,
    sourceLang: string,
    keepUnpipedDisplay = false
  ): string {
    const isPiped = display && display !== target;

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
      // No translation found and no tsl requested: keep as-is
      return `[[${target}${display ? `|${display}` : ''}]]`;
    } else {
      if (isPiped) {
        return `[[${chineseTarget}|${display}]]`;
      }
      if (keepUnpipedDisplay) {
        // Preserve the original target as display name so the LLM can translate it:
        // [[Belgrade]] → [[贝尔格莱德|Belgrade]]
        const originalDisplay = target.replace(/_/g, ' ');
        return `[[${chineseTarget}|${originalDisplay}]]`;
      }
      return `[[${chineseTarget}]]`;
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
    const preserveMode = options?.namespaceMode === 'preserve-namespaces';
    const interwikiPrefix = options?.interwikiPrefix ?? ':en:';
    const placeholderNamespaces = (options?.placeholderNamespaces ?? ['Special', 'Media']).map(n => n.toLowerCase());
    const specialPlaceholders = new Map<string, string>();

    // Apply namespace shortening FIRST, so extraction and replacement operate
    // on the same (final) text form.
    let result = wikitext;
    if (options?.shortenNamespaces) {
      for (const [longNs, shortNs] of options.shortenNamespaces.entries()) {
        result = result.replace(
          new RegExp(`\\[\\[${longNs}:`, 'g'),
          `[[${shortNs}:`
        );
      }
    }

    const links = LinkParser.extractLinks(result);
    const uniqueLinkTargets = Array.from(new Set(links.map(l => l.target)));

    // Partition links based on rules
    const needLookup: string[] = [];           // main-namespace: langlinks lookup (canonical form)
    const skipSet = new Set<string>();         // keep as-is
    const prefixMap = new Map<string, string>();// legacy prefixNamespaces handling
    const preserveSet = new Set<string>();     // preserve-namespaces mode: :en: + optional comment
    const specialSet = new Set<string>();      // → @@SP:N@@ placeholder

    for (const target of uniqueLinkTargets) {
      // Skip placeholders (e.g. @@IW:0@@, @@EL:1@@)
      if (target.match(/^@@[A-Z]+:\d+@@$/)) {
        skipSet.add(target);
        continue;
      }

      // Skip transwiki (any link starting with : is considered transwiki/special)
      if (options?.skipTranswiki && this.isTranswikiLink(target)) {
        skipSet.add(target);
        continue;
      }

      const canonicalTarget = this.normalizeNsAlias(target);

      // Task-specific path skips (checked against canonical form)
      const shouldSkipPath = options?.skipPathPrefixes?.some(p => canonicalTarget.startsWith(p));
      if (shouldSkipPath) {
        skipSet.add(target);
        continue;
      }

      // linkOverrides go through the regular replacement path below
      if (options?.linkOverrides?.has(target) || options?.linkOverrides?.has(canonicalTarget)) {
        continue;
      }

      const ns = this.getNamespace(target);

      // Check skipNamespaces
      if (ns && options?.skipNamespaces?.some(n => n.toLowerCase() === ns.namespace.toLowerCase())) {
        skipSet.add(target);
        continue;
      }

      // Legacy prefixNamespaces (e.g. User → :en:User)
      if (ns && options?.prefixNamespaces?.has(ns.namespace)) {
        prefixMap.set(target, options.prefixNamespaces.get(ns.namespace)!);
        continue;
      }

      // preserve-namespaces mode: non-main namespaces are never translated
      if (preserveMode && this.isNonMainNamespace(target, options?.knownNamespaces)) {
        const nsLower = ns!.namespace.toLowerCase();
        if (placeholderNamespaces.includes(nsLower)) {
          specialSet.add(target);
        } else {
          preserveSet.add(target);
          needLookup.push(canonicalTarget); // for the <!--中文页--> comment
        }
        continue;
      }

      needLookup.push(canonicalTarget);
    }

    // Query langlinks for all lookups (main-namespace replacement + comments)
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
    let spCounter = 0;

    for (const link of links) {
      if (skipSet.has(link.target)) continue;

      let newLinkText = '';
      const canonicalTarget = this.normalizeNsAlias(link.target);
      const pipePart = link.display ? `|${link.display}` : '';

      // Special pages → placeholder (display text stays translatable).
      // The placeholder value carries the interwiki prefix so the restored
      // link points at the source wiki: [[:en:Special:Diff/123|diff]].
      if (specialSet.has(link.target)) {
        const ph = `@@SP:${spCounter}@@`;
        spCounter++;
        specialPlaceholders.set(ph, `${interwikiPrefix}${link.target}`);
        newLinkText = `[[${ph}${pipePart}]]`;
      }
      // preserve-namespaces: [[:en:target|display]]<!--中文页-->
      // Unpiped links get the original target as display name so they render
      // nicely on the target wiki: [[User:XXX]] → [[:en:User:XXX|User:XXX]]
      else if (preserveSet.has(link.target)) {
        const zhTarget = translationMap.get(canonicalTarget);
        const pipe = link.display ? `|${link.display}` : `|${link.target}`;
        newLinkText = `[[${interwikiPrefix}${link.target}${pipe}]]`;
        if (zhTarget) {
          newLinkText += `<!--${zhTarget}-->`;
        }
        statsReplaced++;
      }
      // Legacy prefixed namespaces (e.g. User: → :en:User:)
      else if (prefixMap.has(link.target)) {
        const prefix = prefixMap.get(link.target)!;
        const ns = this.getNamespace(link.target)!;
        const displayPart = link.display ? `|${link.display}` : `|${ns.rest}`;
        // prefix may carry the namespace (":en:User") + rest of the title
        newLinkText = `[[${prefix}:${ns.rest}${displayPart}]]`;
        statsReplaced++;
      }
      // linkOverrides
      else if (options?.linkOverrides?.has(link.target) || options?.linkOverrides?.has(canonicalTarget)) {
        const zhTarget = options.linkOverrides.get(link.target) ?? options.linkOverrides.get(canonicalTarget)!;
        newLinkText = this.makeLink(link.target, link.display, zhTarget || null, sourceLang, options?.keepUnpipedDisplay);
        if (zhTarget) statsReplaced++; else statsTsl++;
      }
      // Wikidata/langlinks results
      else {
        const zhTarget = translationMap.get(canonicalTarget);
        if (zhTarget === '') {
          newLinkText = this.makeLink(link.target, link.display, null, sourceLang, options?.keepUnpipedDisplay);
          statsTsl++;
        } else if (zhTarget) {
          newLinkText = this.makeLink(link.target, link.display, zhTarget, sourceLang, options?.keepUnpipedDisplay);
          statsReplaced++;
        } else {
          newLinkText = this.makeLink(link.target, link.display, undefined, sourceLang, options?.keepUnpipedDisplay);
        }
      }

      if (newLinkText) {
        const originalPattern = `[[${link.target}${pipePart}]]`;
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
      specialPlaceholders,
      linkStats: {
        totalLinks: links.length,
        replacedLinks: statsReplaced,
        tslLinks: statsTsl
      }
    };
  }
}
