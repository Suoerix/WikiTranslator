import { InternalLink } from '../types/wikitext';
import { WikitextParser } from './wikitext';

export class LinkParser {
  static extractLinks(text: string): InternalLink[] {
    const ast = WikitextParser.parse(text);
    const links: InternalLink[] = [];
    
    const visit = (node: any) => {
      if (!node) return;
      if (node.type === 'wikilink') {
        links.push({
          target: node.page, // or node.target depending on wikiparser-node specifics
          display: node.content ? node.content.text() : undefined,
          anchor: node.fragment,
          position: { start: node.start, end: node.end }
        });
      }
      if (node.children) {
        for (const child of node.children) visit(child);
      }
    };
    
    // visit(ast);
    const rx = /\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g;
    let match;
    while ((match = rx.exec(text)) !== null) {
      if (!match[1].startsWith('Category:') && !match[1].startsWith('File:') && !match[1].startsWith('Image:')) {
        let target = match[1];
        let anchor;
        if (target.includes('#')) {
          const parts = target.split('#');
          target = parts[0];
          anchor = parts.slice(1).join('#');
        }
        links.push({
          target: target.trim(),
          display: match[2]?.trim(),
          anchor,
          position: { start: match.index, end: match.index + match[0].length }
        });
      }
    }
    
    return links;
  }
}
