import { Category } from '../types/wikitext';

export class CategoryParser {
  static extractCategories(text: string): Category[] {
    const categories: Category[] = [];
    const rx = /\[\[(?:Category|分类):([^\]|]+)(?:\|([^\]]*))?\]\]/gi;
    let match;
    while ((match = rx.exec(text)) !== null) {
      categories.push({
        name: match[1].trim(),
        sortKey: match[2]?.trim()
      });
    }
    return categories;
  }
}
