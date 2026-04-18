import { PreprocessingResult } from '../types/modules';
import { CategoryParser } from '../parsers/category';
import { TemplateParser } from '../parsers/template';
import { PlaceholderHelper } from '../utils/placeholder';

export class PreprocessingModule {
  preprocess(wikitext: string): PreprocessingResult {
    let cleanedWikitext = wikitext;
    const placeholderMap = new Map<string, string>();
    
    // Feature 1: Remove unwanted templates
    cleanedWikitext = cleanedWikitext.replace(/\{\{\s*Short description\s*\|[^}]+\}\}\n?/gi, '');
    cleanedWikitext = cleanedWikitext.replace(/\{\{\s*Italic title\s*\}\}\n?/gi, '');
    cleanedWikitext = cleanedWikitext.replace(/\s*\(\{\{\s*lang-zh[^}]+\}\}\)/gi, '');
    cleanedWikitext = cleanedWikitext.replace(/\{\{\s*lang-zh[^}]+\}\}/gi, '');

    // 1. Extract and remove categories
    const removedCategories = CategoryParser.extractCategories(cleanedWikitext);
    // Remove category declarations from wikitext
    // [[Category:...]] or [[分类:...]]
    cleanedWikitext = cleanedWikitext.replace(/\[\[(?:Category|分类):[^\]]+\]\]\n?/gi, '');

    let refCount = 0;
    let mathCount = 0;
    let codeCount = 0;
    let syntaxCount = 0;
    let parserCount = 0;

    // 2. Replace cite templates within <ref>
    const citeRefs = TemplateParser.extractCiteTemplatesFromRefs(cleanedWikitext);
    for (const ref of citeRefs) {
      let citeInner = ref.citeInner;

      // Feature 4: remove language parameters
      citeInner = citeInner.replace(/\|\s*language\s*=\s*(?:zh|zh-cn|zh-hans|zh-tw|zh-hk|zh-sg|chinese|中文)\s*(?=[|}])/gi, '');
      
      // Feature 4: duplicate link target as display for cite inner
      citeInner = citeInner.replace(/\[\[([^\]|]+)\]\]/g, '[[$1|$1]]');

      const placeholder = PlaceholderHelper.createPlaceholder('ref', refCount++);
      cleanedWikitext = cleanedWikitext.replace(ref.refFull, `<ref>${placeholder}</ref>`);
      placeholderMap.set(placeholder, citeInner);
    }

    // 3. Replace <math>
    cleanedWikitext = cleanedWikitext.replace(/<math[^>]*>[\s\S]*?<\/math>/gi, (match) => {
      const placeholder = PlaceholderHelper.createPlaceholder('math', mathCount++);
      placeholderMap.set(placeholder, match);
      return placeholder;
    });

    // 4. Replace <code> and <pre>
    cleanedWikitext = cleanedWikitext.replace(/<(code|pre)[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
      const placeholder = PlaceholderHelper.createPlaceholder('code', codeCount++);
      placeholderMap.set(placeholder, match);
      return placeholder;
    });

    // 5. Replace <syntaxhighlight>
    cleanedWikitext = cleanedWikitext.replace(/<syntaxhighlight[^>]*>[\s\S]*?<\/syntaxhighlight>/gi, (match) => {
      const placeholder = PlaceholderHelper.createPlaceholder('syntaxhighlight', syntaxCount++);
      placeholderMap.set(placeholder, match);
      return placeholder;
    });

    // 6. Replace Parser functions and Magic words ({{#...}}, {{CURRENTYEAR}})
    // a simplified regex since AST might be overkill unless using wikiparser-node
    cleanedWikitext = cleanedWikitext.replace(/\{\{(?:#|CURRENT|PAGE|NAME)[^}]+\}\}/gi, (match) => {
      const placeholder = PlaceholderHelper.createPlaceholder('parserFunction', parserCount++);
      placeholderMap.set(placeholder, match);
      return placeholder;
    });

    // 7. Remove HTML comments
    cleanedWikitext = cleanedWikitext.replace(/<!--[\s\S]*?-->/g, '');

    return {
      cleanedWikitext,
      placeholderMap,
      removedCategories,
    };
  }
}
