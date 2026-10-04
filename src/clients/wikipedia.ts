import { loadEnv } from '../config/env';
import { retryWithBackoff } from '../utils/retry';
import { ConversionGroup } from '../types/api';

const env = loadEnv();

export class WikipediaClient {
  private readonly userAgent = env.WIKIPEDIA_USER_AGENT;
  private externalRequester: ((lang: string, params: any) => Promise<any>) | null = null;

  /**
   * Set an external requester (e.g. mwn instance) to handle API calls.
   * This ensures authentication cookies are reused.
   */
  public setRequester(requester: (lang: string, params: any) => Promise<any>) {
    this.externalRequester = requester;
  }

  public async query(lang: string, params: Record<string, string>) {
    if (this.externalRequester) {
      // Use mwn or other authenticated requester
      const result = await retryWithBackoff(async () => {
        return this.externalRequester!(lang, params);
      }, 10, 2000);
      
      if (result) return result;
    }

    const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    url.searchParams.append('format', 'json');
    url.searchParams.append('formatversion', '2');

    return retryWithBackoff(async () => {
      const res = await fetch(url.toString(), {
        headers: {
          'User-Agent': `PexBot/1.0 (zh:wikipedia; User:PexBot; https://zh.wikipedia.org/wiki/User:PexBot) WikiTranslator/1.0`,
        },
      });
      if (!res.ok) {
         if (res.status === 429 || res.status === 503) {
            throw new Error(`Wikipedia API error: ${res.statusText} (Status: ${res.status})`);
         }
         throw new Error(`Wikipedia API error: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.error) throw new Error(`Wikipedia API error: ${data.error.info}`);
      return data;
    }, 10, 2000); // 10 retries, 2s base delay for Wikipedia specifically
  }

  /**
   * Resolve redirects for a set of titles.
   */
  async resolveRedirects(lang: string, titles: string[]): Promise<Map<string, string>> {
    const redirectMap = new Map<string, string>();
    if (titles.length === 0) return redirectMap;

    const CHUNK_SIZE = 50;
    for (let i = 0; i < titles.length; i += CHUNK_SIZE) {
      const chunk = titles.slice(i, i + CHUNK_SIZE);
      const data = await this.query(lang, {
        action: 'query',
        titles: chunk.join('|'),
        redirects: '1',
      });

      const normMap = new Map<string, string>();
      for (const norm of data.query?.normalized || []) {
        normMap.set(norm.from, norm.to);
      }

      const redirMap = new Map<string, string>();
      for (const redir of data.query?.redirects || []) {
        redirMap.set(redir.from, redir.to);
      }

      for (const name of chunk) {
        let resolved = name;
        if (normMap.has(resolved)) resolved = normMap.get(resolved)!;
        if (redirMap.has(resolved)) resolved = redirMap.get(resolved)!;
        if (resolved !== name) {
          redirectMap.set(name, resolved);
        }
      }

      if (i + CHUNK_SIZE < titles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay
      }
    }

    return redirectMap;
  }

  async getWikitext(language: string, article: string): Promise<string> {
    const data = await this.query(language, {
      action: 'query',
      prop: 'revisions',
      titles: article,
      rvprop: 'content',
      rvslots: 'main',
    });

    const pages = data.query?.pages;
    if (!pages || pages.length === 0 || pages[0].missing) {
      throw new Error(`Article not found: ${article}`);
    }

    return pages[0].revisions?.[0]?.slots?.main?.content || '';
  }

  async getLangLinks(language: string, articles: string[], targetLang: string = 'zh'): Promise<Map<string, string>> {
    const mapping = new Map<string, string>();
    if (articles.length === 0) return mapping;

    // chunk requests? Wikipedia allows max 50 titles per request.
    const CHUNK_SIZE = 50;
    for (let i = 0; i < articles.length; i += CHUNK_SIZE) {
      const chunk = articles.slice(i, i + CHUNK_SIZE);
      const data = await this.query(language, {
        action: 'query',
        prop: 'langlinks',
        titles: chunk.join('|'),
        lllang: targetLang,
        redirects: 'true',
        lllimit: '50',
        formatversion: '2',
      });

      const pagesData = data.query?.pages || [];
      const pages = Array.isArray(pagesData) ? pagesData : Object.values(pagesData);
      const redirects = data.query?.redirects || [];
      const normalized = data.query?.normalized || [];

      const normMap = new Map<string, string>();
      for (const norm of normalized) normMap.set(norm.from, norm.to);

      const redirMap = new Map<string, string>();
      for (const redir of redirects) redirMap.set(redir.from, redir.to);

      const forwardMap = new Map<string, string>();
      for (const originalQuery of chunk) {
         let current = originalQuery;
         // Follow normalizations
         if (normMap.has(current)) current = normMap.get(current)!;
         // Follow redirects in a loop to handle A -> B -> C
         let visited = new Set<string>([current]);
         while (redirMap.has(current)) {
           const next = redirMap.get(current)!;
           if (visited.has(next)) break; // Circular redirect protection
           current = next;
           visited.add(current);
         }
         forwardMap.set(originalQuery, current);
      }

      const finalTitleToZh = new Map<string, string>();
      for (const page of pages) {
        if (page.langlinks && page.langlinks.length > 0) {
           finalTitleToZh.set(page.title, page.langlinks[0].title);
        } else {
           finalTitleToZh.set(page.title, ''); // exists but no link
        }
      }

      for (const originalQuery of chunk) {
         const finalTitle = forwardMap.get(originalQuery)!;
         const zhTranslation = finalTitleToZh.get(finalTitle);
         if (zhTranslation !== undefined) {
             mapping.set(originalQuery, zhTranslation);
         }
      }

      if (i + CHUNK_SIZE < articles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return mapping;
  }

  /**
   * Check if multiple pages exist on the wiki.
   * Returns a Set of existing titles.
   */
  async batchCheckExistence(language: string, titles: string[]): Promise<Set<string>> {
    const existing = new Set<string>();
    if (titles.length === 0) return existing;

    const CHUNK_SIZE = 50;
    for (let i = 0; i < titles.length; i += CHUNK_SIZE) {
      const chunk = titles.slice(i, i + CHUNK_SIZE);
      const data = await this.query(language, {
        action: 'query',
        titles: chunk.join('|'),
        formatversion: '2',
      });

      const pages = data.query?.pages || [];
      const pagesArray = Array.isArray(pages) ? pages : Object.values(pages);
      
      for (const page of pagesArray) {
        if (page && !page.missing) {
          existing.add(page.title);
        }
      }
    }

    return existing;
  }

  async getConversionGroups(): Promise<ConversionGroup[]> {
    // TODO: retrieved by parsing Module:CGroup/xxx or Template:CGroup/list
    return [
      { name: 'IT', category: 'Information Technology', rules: [] },
      { name: 'Geography', category: 'Geography', rules: [] },
      { name: 'Science', category: 'Science', rules: [] }
    ];
  }

  private interwikiCache = new Map<string, Array<{ prefix: string, isLanguage: boolean }>>();

  /**
   * Fetch interwiki map for the current site.
   * Returns a list of prefixes and whether they are language links.
   */
  async getInterwikiMap(site: string = 'en'): Promise<Array<{ prefix: string, isLanguage: boolean }>> {
    if (this.interwikiCache.has(site)) {
      return this.interwikiCache.get(site)!;
    }

    const response = await this.query(site, {
      action: 'query',
      meta: 'siteinfo',
      siprop: 'interwikimap',
    });

    if (!response.query?.interwikimap) return [];

    const result = response.query.interwikimap.map((item: any) => ({
      prefix: item.prefix,
      isLanguage: !!item.language
    }));
    
    this.interwikiCache.set(site, result);
    return result;
  }
}
