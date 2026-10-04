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
    const skipModules = new Set(finalConfig.skipModules || []);
    const llmOptions = {
      provider: finalConfig.llmProvider,
      model: finalConfig.llmModel,
    };

    const wikiClient = new WikipediaClient();
    const preprocessor = new PreprocessingModule();
    const translationModule = new TranslationModule();
    const templateModule = new TemplateProcessingModule();
    const dateModule = new DateNormalizationModule();
    const linkModule = new LinkReplacementModule();
    const syntaxModule = new SyntaxCheckModule();

    // 1. Fetch
    const wikitext = await wikiClient.getWikitext(finalConfig.sourceLanguage, finalConfig.sourceArticle);

    // 2. Preprocess
    const { cleanedWikitext, placeholderMap, removedCategories } = preprocessor.preprocess(wikitext);

    // Merge glossaries
    const mergedGlossary = {
      ...(finalConfig.glossary || {}),
      ...(finalConfig.additionalGlossary || {}),
    };

    // 3. Translate
    let text = await translationModule.translate(
      cleanedWikitext, 
      finalConfig.sourceLanguage, 
      mergedGlossary, 
      finalConfig.styleGuide,
      llmOptions
    );

    // 4. Conversion Groups (skippable)
    if (!skipModules.has('conversion')) {
      const conversionModule = new ConversionModule();
      text = await conversionModule.applyConversionGroups(text, llmOptions);
    }

    // 5. Templates (skippable)
    if (!skipModules.has('templates')) {
      text = await templateModule.processTemplates(
        text, placeholderMap, finalConfig.sourceLanguage,
        finalConfig.templateOverrides
      );
    } else {
      // Still restore placeholders even if skipping template processing
      for (const [placeholder, original] of placeholderMap.entries()) {
        text = text.replace(placeholder, () => original);
      }
    }

    // 6. Dates (skippable)
    if (!skipModules.has('dates')) {
      text = dateModule.normalizeDates(text);
    }

    // 7. Links (skippable)
    if (!skipModules.has('links')) {
      const linkResult = await linkModule.replaceLinks(
        text, removedCategories, finalConfig.sourceLanguage,
        finalConfig.linkReplacementOptions
      );
      text = linkResult.wikitext;
    }

    // 8. Syntax Check
    const validationReport = syntaxModule.validate(text);

    return {
      translatedWikitext: text,
      validationReport,
      metadata: {
        timestamp: new Date().toISOString(),
        llmModel: finalConfig.llmModel || 'default',
        tokensUsed: 0,
      }
    };
  }
}
