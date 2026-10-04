export type SkippableModule = 'conversion' | 'templates' | 'links' | 'dates';

export interface LinkReplacementOptions {
  /** Override map: original link target → Chinese target. Checked before Wikidata. */
  linkOverrides?: Map<string, string>;
  /** Namespaces to skip entirely (no Wikidata lookup, kept as-is). */
  skipNamespaces?: string[];
  /** Namespaces to prefix instead of translating. e.g. {"User": ":en:"} → [[:en:User:X|X]] */
  prefixNamespaces?: Map<string, string>;
  /** Namespaces to shorten. e.g. {"Wikipedia": "WP"} */
  shortenNamespaces?: Map<string, string>;
  /** If true, skip transwiki links (e.g. [[:meta:...]]) */
  skipTranswiki?: boolean;
  /** Custom path prefixes to skip (e.g., ["Wikipedia:Wikipedia Signpost/"]) */
  skipPathPrefixes?: string[];
}

export interface TranslationConfig {
  sourceLanguage: string;
  sourceArticle: string;
  targetArticle?: string;
  glossary?: Record<string, string>;
  styleGuide?: string;
  llmProvider?: string;
  llmModel?: string;

  /** Skip specified processing modules. */
  skipModules?: SkippableModule[];
  /** Override map for template name translation. Checked after redirect resolution, before Wikidata. */
  templateOverrides?: Map<string, string>;
  /** Options for link replacement behavior. */
  linkReplacementOptions?: LinkReplacementOptions;
  /** Additional prompt text to append to the base translation prompt. */
  additionalPrompt?: string;
  /** Additional glossary entries to merge with the base glossary. */
  additionalGlossary?: Record<string, string>;
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
