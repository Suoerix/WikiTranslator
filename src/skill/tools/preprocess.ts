import { PreprocessingModule } from '../../core/preprocessing';
import { WikipediaClient } from '../../clients/wikipedia';
import { SessionManager } from '../session/session-manager';
import { getFilledPrompt } from '../../core/prompts';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';

export interface PreprocessParams {
  sourceLanguage: string;
  sourceArticle: string;
  targetArticle?: string;
  outputFile?: string;
  glossaryFile?: string;
  styleGuideFile?: string;
}

export interface PreprocessResult {
  sessionId: string;
  sessionFile: string;
  translationPrompt: string;
  conversionPrompt: string;
  outputFile: string;
}

export class PreprocessTool {
  async preprocess(params: PreprocessParams): Promise<PreprocessResult> {
    const wikiClient = new WikipediaClient();
    const preprocessor = new PreprocessingModule();
    const sessionManager = new SessionManager();

    // 1. Generate session ID
    const sessionId = randomUUID();

    // 2. Target Article (skipped article naming module for MVP due to exclusion)
    const targetArticle = params.targetArticle || params.sourceArticle;

    // 3. Fetch source wikitext
    const wikitext = await wikiClient.getWikitext(params.sourceLanguage, params.sourceArticle);

    // 4 & 5. Load Glossary & Style Guide
    let glossary: Record<string, string> = {};
    if (params.glossaryFile && fs.existsSync(params.glossaryFile)) {
      const csv = fs.readFileSync(params.glossaryFile, 'utf-8');
      const lines = csv.split('\n');
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          const [source, target] = line.split(',');
          if (source && target) glossary[source.trim()] = target.trim();
        }
      }
    }

    let styleGuide = '';
    if (params.styleGuideFile && fs.existsSync(params.styleGuideFile)) {
      styleGuide = fs.readFileSync(params.styleGuideFile, 'utf-8');
    }

    // 6. Preprocessing
    const { cleanedWikitext, placeholderMap, removedCategories } = preprocessor.preprocess(wikitext);
    const plainPlaceholderMap = Object.fromEntries(placeholderMap.entries());

    // 7. Conversion Groups
    const conversionGroups = await wikiClient.getConversionGroups();
    const groupListStr = conversionGroups.map(g => `- ${g.name} (${g.category})`).join('\n');

    // 8 & 9. Generate Prompts
    const translationPrompt = getFilledPrompt('translation', {
      source_lang: params.sourceLanguage,
      glossary_terms: Object.entries(glossary).map(([k, v]) => `${k}: ${v}`).join('\n') || 'None',
      style_guide_rules: styleGuide || 'None',
    });

    const conversionPrompt = getFilledPrompt('conversion-analysis', {
      conversion_group_list: groupListStr,
    });

    // 10. Save Session State
    const sanitizedName = params.sourceArticle.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    const outFile = params.outputFile || path.resolve(process.cwd(), `${sanitizedName}-${sessionId}.wikitext`);

    await sessionManager.save(outFile, {
      sessionId,
      timestamp: new Date().toISOString(),
      sourceLanguage: params.sourceLanguage,
      sourceArticle: params.sourceArticle,
      targetArticle,
      placeholderMap: plainPlaceholderMap,
      removedCategories,
      glossary,
      appliedConversionGroups: [],
      translationPrompt,
      conversionPrompt,
      wikitext: cleanedWikitext
    });

    return {
      sessionId,
      sessionFile: outFile,
      translationPrompt,
      conversionPrompt,
      outputFile: outFile,
    };
  }
}

// CLI Execution Support
if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('preprocess.cjs') || process.argv[1].endsWith('preprocess.js') || process.argv[1].endsWith('preprocess.ts'))
) {
  const { values } = parseArgs({
    options: {
      sourceLang: { type: 'string', short: 'l' },
      sourceArticle: { type: 'string', short: 'a' },
      targetArticle: { type: 'string', short: 't' },
      outputFile: { type: 'string', short: 'o' },
      glossaryFile: { type: 'string', short: 'g' },
      styleGuideFile: { type: 'string', short: 's' },
    },
    strict: false,
  });

  if (!values.sourceLang || !values.sourceArticle) {
    console.error('Usage: node preprocess.cjs --sourceLang <lang> --sourceArticle <article>');
    process.exit(1);
  }

  const tool = new PreprocessTool();
  tool.preprocess({
    sourceLanguage: values.sourceLang as string,
    sourceArticle: values.sourceArticle as string,
    targetArticle: values.targetArticle as string,
    outputFile: values.outputFile as string,
    glossaryFile: values.glossaryFile as string,
    styleGuideFile: values.styleGuideFile as string,
  })
    .then((result) => {
      // Output as JSON for machine readability in scripts
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error('Failed to run preprocess:', err);
      process.exit(1);
    });
}
