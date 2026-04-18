import { Template } from '../types/wikitext';

export class TemplateParser {
  static extractTemplates(text: string): Template[] {
    const templates: Template[] = [];
    const rx = /\{\{([^|}]+)(?:\|([^}]+))?\}\}/g;
    let match;
    while ((match = rx.exec(text)) !== null) {
      const name = match[1].trim();
      const paramStr = match[2];
      const parameters = new Map<string, string>();
      
      if (paramStr) {
        const parts = paramStr.split('|');
        let idx = 1;
        parts.forEach(p => {
          const eqIdx = p.indexOf('=');
          if (eqIdx > -1) {
            const k = p.substring(0, eqIdx).trim();
            const v = p.substring(eqIdx + 1).trim();
            parameters.set(k, v);
          } else {
            parameters.set(idx.toString(), p.trim());
            idx++;
          }
        });
      }

      templates.push({
        name,
        parameters,
        position: { start: match.index, end: match.index + match[0].length }
      });
    }
    return templates;
  }
  
  static extractCiteTemplatesFromRefs(text: string): { refFull: string, citeInner: string, startIndex: number }[] {
    const results = [];
    const rx = /<ref[^>]*(?<!\/)>([\s\S]*?)<\/ref>/gi;
    let match;
    while ((match = rx.exec(text)) !== null) {
      const inner = match[1];
      if (inner.includes('{{cite') || inner.includes('{{Cite')) {
        results.push({
          refFull: match[0],
          citeInner: inner,
          startIndex: match.index
        });
      }
    }
    return results;
  }
}
