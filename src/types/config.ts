export interface TranslationConfig {
  sourceLanguage: string;
  sourceArticle: string;
  targetArticle?: string;
  glossary?: Record<string, string>;
  styleGuide?: string;
  llmProvider?: string;
  llmModel?: string;
}

export interface TranslationMetadata {
  timestamp: string;
  llmModel: string;
  tokensUsed: number;
}

export interface TranslationResult {
  translatedWikitext: string;
  validationReport: import('./api').ValidationReport;
  metadata: TranslationMetadata;
}
