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
  /**
   * 'translate-all' (default): every link is looked up and translated.
   * 'preserve-namespaces': non-main-namespace links are NOT translated.
   *   They get the interwiki prefix (e.g. [[:en:WP:Village pump]]), optionally
   *   followed by an HTML comment with the Chinese counterpart
   *   (e.g. [[:en:WP:Village pump]]<!--Wikipedia:互助客栈-->) so the LLM can
   *   decide whether to swap it in.
   */
  namespaceMode?: 'translate-all' | 'preserve-namespaces';
  /** Interwiki prefix used in preserve-namespaces mode. Default ':en:'. */
  interwikiPrefix?: string;
  /**
   * When a main-namespace link is replaced and the original had no pipe,
   * keep the original target as the display name: [[贝尔格莱德|Belgrade]].
   */
  keepUnpipedDisplay?: boolean;
  /**
   * Namespaces whose links become placeholders (default: Special, Media).
   * Placeholder: @@SP:N@@ (or [[@@SP:N@@|display]] when piped).
   */
  placeholderNamespaces?: string[];
  /** Extra namespace names/aliases treated as non-main in preserve mode. */
  knownNamespaces?: string[];
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
