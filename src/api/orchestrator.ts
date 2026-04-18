import { TranslationConfig, TranslationResult } from '../types/config';
import { PreprocessingModule } from '../core/preprocessing';
import { TranslationModule } from '../core/translation';
import { ConversionModule } from '../core/zh-conversion';
import { TemplateProcessingModule } from '../core/template-processing';
import { DateNormalizationModule } from '../core/date-normalization';
import { LinkReplacementModule } from '../core/link-replacement';
import { SyntaxCheckModule } from '../core/syntax-check';
import { WikipediaClient } from '../clients/wikipedia';

export class Orchestrator {
  private baseConfig?: Partial<TranslationConfig>;

  constructor(baseConfig?: Partial<TranslationConfig>) {
    this.baseConfig = baseConfig;
  }

  async execute(config: TranslationConfig): Promise<TranslationResult> {
    const finalConfig = { ...this.baseConfig, ...config };
    const llmOptions = {
      provider: finalConfig.llmProvider,
      model: finalConfig.llmModel,
    };

    const wikiClient = new WikipediaClient();
    const preprocessor = new PreprocessingModule();
    const translationModule = new TranslationModule();
    const conversionModule = new ConversionModule();
    const templateModule = new TemplateProcessingModule();
    const dateModule = new DateNormalizationModule();
    const linkModule = new LinkReplacementModule();
    const syntaxModule = new SyntaxCheckModule();

    const startTokens = 0; // naive stub since token counting requires tiktoken

    // 1. Fetch
    const wikitext = await wikiClient.getWikitext(finalConfig.sourceLanguage, finalConfig.sourceArticle);

    // 2. Preprocess
    const { cleanedWikitext, placeholderMap, removedCategories } = preprocessor.preprocess(wikitext);

    // 3. Translate
    let text = await translationModule.translate(
      cleanedWikitext, 
      finalConfig.sourceLanguage, 
      finalConfig.glossary, 
      finalConfig.styleGuide,
      llmOptions
    );

    // 4. Conversion Groups
    text = await conversionModule.applyConversionGroups(text, llmOptions);

    // 5. Templates
    text = await templateModule.processTemplates(text, placeholderMap, finalConfig.sourceLanguage);

    // 6. Dates
    text = dateModule.normalizeDates(text);

    // 7. Links
    const linkResult = await linkModule.replaceLinks(text, removedCategories, finalConfig.sourceLanguage);
    text = linkResult.wikitext;

    // 8. Syntax Check
    const validationReport = syntaxModule.validate(text);

    return {
      translatedWikitext: text,
      validationReport,
      metadata: {
        timestamp: new Date().toISOString(),
        llmModel: finalConfig.llmModel || 'default',
        tokensUsed: 0, // mocked
      }
    };
  }
}
