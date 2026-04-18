import { Category } from './wikitext';

export interface PreprocessingResult {
  cleanedWikitext: string;
  placeholderMap: Map<string, string>;
  removedCategories: Category[];
}

export interface LinkReplacementResult {
  wikitext: string;
  translatedCategories: Category[];
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
