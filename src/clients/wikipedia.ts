import { loadEnv } from '../config/env';
import { retryWithBackoff } from '../utils/retry';
import { ConversionGroup } from '../types/api';

const env = loadEnv();

export class WikipediaClient {
  private readonly userAgent = env.WIKIPEDIA_USER_AGENT;

  private async fetchApi(lang: string, params: Record<string, string>) {
    const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    url.searchParams.append('format', 'json');
    url.searchParams.append('formatversion', '2');

    return retryWithBackoff(async () => {
      const res = await fetch(url.toString(), {
        headers: {
          'User-Agent': this.userAgent,
        },
      });
      if (!res.ok) throw new Error(`Wikipedia API error: ${res.statusText}`);
      const data = await res.json();
      if (data.error) throw new Error(`Wikipedia API error: ${data.error.info}`);
      return data;
    });
  }

  async getWikitext(language: string, article: string): Promise<string> {
    const data = await this.fetchApi(language, {
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
      const data = await this.fetchApi(language, {
        action: 'query',
        prop: 'langlinks',
        titles: chunk.join('|'),
        lllang: targetLang,
        redirects: 'true',
        lllimit: '50',
      });

      const pages = data.query?.pages || [];
      const redirects = data.query?.redirects || [];
      const normalized = data.query?.normalized || [];

      const normMap = new Map<string, string>();
      for (const norm of normalized) normMap.set(norm.from, norm.to);

      const redirMap = new Map<string, string>();
      for (const redir of redirects) redirMap.set(redir.from, redir.to);

      const forwardMap = new Map<string, string>();
      for (const originalQuery of chunk) {
         let current = originalQuery;
         if (normMap.has(current)) current = normMap.get(current)!;
         if (redirMap.has(current)) current = redirMap.get(current)!;
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
    }

    return mapping;
  }

  async getConversionGroups(): Promise<ConversionGroup[]> {
    // TODO: retrieved by parsing Module:CGroup/xxx or Template:CGroup/list
    return [
      { name: 'IT', category: 'Information Technology', rules: [] },
      { name: 'Geography', category: 'Geography', rules: [] },
      { name: 'Science', category: 'Science', rules: [] }
    ];
  }
}
