// Export all public APIs
export { PreprocessTool } from './skill/tools/preprocess';
export { PostprocessTool } from './skill/tools/postprocess';
export { WikiTranslator } from './api/translator';

// Export types
export type { PreprocessParams, PreprocessResult } from './skill/tools/preprocess';
export type { PostprocessParams, PostprocessResult } from './skill/tools/postprocess';
export type { TranslationConfig, TranslationResult, LinkReplacementOptions, SkippableModule } from './types/config';
export type { ValidationReport } from './types/api';

// Export core modules
export * from './core/preprocessing';
export * from './core/translation';
export * from './core/zh-conversion';
export * from './core/template-processing';
export * from './core/date-normalization';
export * from './core/link-replacement';
export * from './core/syntax-check';

// Export clients (for external use by PexBot etc.)
export { LLMClient } from './clients/llm';
export type { LLMOptions } from './clients/llm';
export { WikipediaClient } from './clients/wikipedia';
export { WikidataClient } from './clients/wikidata';

// Export parsers
export { LinkParser } from './parsers/link';
export { TemplateParser } from './parsers/template';
export { CategoryParser } from './parsers/category';

// Export utilities
export { PlaceholderHelper } from './utils/placeholder';
