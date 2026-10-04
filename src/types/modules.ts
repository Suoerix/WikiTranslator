import { Category } from './wikitext';

export interface PreprocessingResult {
  cleanedWikitext: string;
  placeholderMap: Map<string, string>;
  removedCategories: Category[];
}

export interface LinkReplacementResult {
  wikitext: string;
  translatedCategories: Category[];
  /**
   * Placeholders generated for special pages (e.g. @@SP:0@@ → Special:Diff/123).
   * Merge into the caller's placeholderMap so postprocessing restores them.
   */
  specialPlaceholders: Map<string, string>;
  linkStats: {
    totalLinks: number;
    replacedLinks: number;
    tslLinks: number;
  };
}

export interface ArticleNamingOutput {
  chineseName: string;
  confidence: number;
  reasoning: string;
}
