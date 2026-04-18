import { loadEnv } from '../config/env';
import { retryWithBackoff } from '../utils/retry';
import { WikidataEntity } from '../types/api';

const env = loadEnv();

export class WikidataClient {
  private readonly userAgent = env.WIKIPEDIA_USER_AGENT;

  private async fetchApi(params: Record<string, string>) {
    const url = new URL(`https://www.wikidata.org/w/api.php`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    url.searchParams.append('format', 'json');

    return retryWithBackoff(async () => {
      const res = await fetch(url.toString(), {
        headers: {
          'User-Agent': this.userAgent,
        },
      });
      if (!res.ok) throw new Error(`Wikidata API error: ${res.statusText}`);
      return await res.json();
    });
  }

  async getEntityByArticle(articleName: string, site: string = 'enwiki'): Promise<WikidataEntity | null> {
    const data = await this.fetchApi({
      action: 'wbgetentities',
      sites: site,
      titles: articleName,
      props: 'labels|claims',
    });

    const entities = data.entities;
    if (!entities || Object.keys(entities)[0] === '-1') {
      return null;
    }
    
    const id = Object.keys(entities)[0];
    const entity = entities[id];

    const labels: Record<string, string> = {};
    if (entity.labels) {
       for(const [lang, val] of Object.entries(entity.labels)) {
         labels[lang] = (val as any).value;
       }
    }

    return {
      id,
      labels,
      claims: entity.claims || {},
    };
  }

  async getChineseLabel(entityId: string): Promise<string | null> {
    const data = await this.fetchApi({
      action: 'wbgetentities',
      ids: entityId,
      props: 'labels',
      languages: 'zh|zh-hans|zh-cn',
    });

    const entity = data.entities?.[entityId];
    if (!entity || !entity.labels) return null;

    const labels = entity.labels;
    return labels['zh-cn']?.value || labels['zh-hans']?.value || labels['zh']?.value || null;
  }
}
