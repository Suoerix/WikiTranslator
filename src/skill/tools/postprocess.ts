import { TemplateProcessingModule } from '../../core/template-processing';
import { DateNormalizationModule } from '../../core/date-normalization';
import { LinkReplacementModule } from '../../core/link-replacement';
import { SyntaxCheckModule } from '../../core/syntax-check';
import { SessionManager } from '../session/session-manager';
import { ValidationReport } from '../../types/api';
import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';

export interface PostprocessParams {
  sessionFile: string;
  outputFile?: string;
}

export interface PostprocessResult {
  outputFile: string;
  validationReport: ValidationReport;
  statistics: {
    linksReplaced: number;
    tslLinks: number;
    categoriesAdded: number;
  };
}

export class PostprocessTool {
  async postprocess(params: PostprocessParams): Promise<PostprocessResult> {
    const sessionManager = new SessionManager();
    const templateModule = new TemplateProcessingModule();
    const dateModule = new DateNormalizationModule();
    const linkModule = new LinkReplacementModule();
    const syntaxModule = new SyntaxCheckModule();

    // 1. Load Session
    const session = await sessionManager.load(params.sessionFile);

    let finalWikitext = session.wikitext;

    // 3. Template Processing
    const placeholderMap = new Map(Object.entries(session.placeholderMap));
    finalWikitext = await templateModule.processTemplates(finalWikitext, placeholderMap, session.sourceLanguage);

    // 4. Date Normalization
    finalWikitext = dateModule.normalizeDates(finalWikitext);

    // 5. NoteTA conversion groups
    if (session.appliedConversionGroups && session.appliedConversionGroups.length > 0) {
      const args = session.appliedConversionGroups.map((g: string, i: number) => `G${i + 1}=${g}`).join('|');
      finalWikitext = `{{NoteTA|${args}}}\n` + finalWikitext;
    }

    // 6. Link Replacement
    const linkResult = await linkModule.replaceLinks(finalWikitext, session.removedCategories, session.sourceLanguage);
    finalWikitext = linkResult.wikitext;

    // 7. Syntax Check
    const validationReport = syntaxModule.validate(finalWikitext);

    // 8. Save final wikitext
    const outputFile = params.outputFile || `${session.targetArticle || session.sourceArticle}.txt`;
    const fullOutputPath = path.resolve(process.cwd(), outputFile);
    await fs.promises.mkdir(path.dirname(fullOutputPath), { recursive: true });
    await fs.promises.writeFile(fullOutputPath, finalWikitext, 'utf-8');

    // 9. Delete session
    try {
      await sessionManager.delete(params.sessionFile);
    } catch (e) {
      console.warn(`Failed to delete session ${params.sessionFile}`);
    }

    return {
      outputFile,
      validationReport,
      statistics: {
        linksReplaced: linkResult.linkStats.replacedLinks,
        tslLinks: linkResult.linkStats.tslLinks,
        categoriesAdded: linkResult.translatedCategories.length,
      }
    };
  }
}

// CLI Execution Support
if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('postprocess.cjs') || process.argv[1].endsWith('postprocess.js') || process.argv[1].endsWith('postprocess.ts'))
) {
  const { values } = parseArgs({
    options: {
      sessionFile: { type: 'string', short: 's' },
      outputFile: { type: 'string', short: 'o' },
    },
    strict: false,
  });

  if (!values.sessionFile) {
    console.error('Usage: node postprocess.cjs --sessionFile <file.wikitext> [--outputFile <out.txt>]');
    process.exit(1);
  }

  const tool = new PostprocessTool();
  tool.postprocess({
    sessionFile: values.sessionFile as string,
    outputFile: values.outputFile as string,
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error('Failed to run postprocess:', err);
      process.exit(1);
    });
}
