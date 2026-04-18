---
name: wiki-translator
description: Translate Wikipedia articles from any language to Chinese Wikipedia format while preserving wikitext structure, templates, links, and categories
keywords: wikipedia, translation, wikitext, chinese, 维基百科, 翻译
version: 1.0.0
author: WikiTranslator Team
---

# WikiTranslator Skill

Translates Wikipedia articles from source languages (primarily English) to Chinese Wikipedia, outputting properly formatted wikitext with translated content, localized links, and regional variant conversion groups.

## Capabilities

- Determine appropriate Chinese article names following Wikipedia naming conventions
- Translate article content while preserving wikitext syntax
- Replace internal links with Chinese equivalents or {{tsl}} templates
- Apply Chinese Wikipedia regional variant conversion groups
- Handle citation templates and special template processing
- Validate final wikitext syntax

## Usage Examples

**Basic Translation**:
```
Translate the English Wikipedia article "Artificial Intelligence" to Chinese
```

**With Custom Article Name**:
```
Translate en:Machine Learning to Chinese, name it "机器学习"
```

**With Glossary**:
```
Translate en:Neural Network to Chinese using glossary from glossary.csv
```

**With Style Guide**:
```
Translate en:Deep Learning to Chinese following style_guide.md
```

## Configuration Files

Place these files in your workspace root:

- `glossary.csv`: Terminology mappings (CSV format)
- `style_guide.md`: Formatting rules (Markdown or plain text)

## Workflow

The Host Agent must execute the following tools natively using `Bash` commands. (Ensure you have run `npm install` in the workspace root first).

1. **Article Naming** (if not specified): Determine Chinese name.
2. **Preprocessing**: 
   Run the preprocess tool to remove cite templates and build the unified Session File.
   ```bash
   npx tsx src/skill/tools/preprocess.ts --sourceLang en --sourceArticle "Article Name"
   ```
   **READ** the JSON output. It will return the `sessionFile` (e.g. `Article Name-uuid.wikitext` in your workspace limit). This single file is a `.wikitext` file with a YAML Frontmatter block containing all the session configurations and conversion group targets, followed by HTML comments containing your prompts. 

3. **Translation & Conversion Analysis**: 
   Create a sub-agent to handle the translation and conversion analysis.
   - Hand the `sessionFile` to your sub-agent.
   - Tell your sub-agent to read the `TRANSLATION INSTRUCTIONS` and `CONVERSION ANALYSIS INSTRUCTIONS` located inside the HTML comments in the file.
   - Instruct your sub-agent to translate the actual wikitext at the bottom of the file to Simplified Chinese piece by piece or entirely. **DIRECTLY EDIT** the `sessionFile`, replacing the English wikitext with translations.
   - Tell your sub-agent to figure out the correct conversion groups and inject them directly into the YAML Frontmatter block of the `sessionFile` (under the `appliedConversionGroups` array field).

4. **Postprocessing**: 
   Restore templates, apply conversion groups, replace links, and validate syntax.
   ```bash
   npx tsx src/skill/tools/postprocess.ts --sessionFile <path_to_the_edited_sessionFile>
   ```
   **READ** the JSON output to get the final `outputFile` path (which will be successfully polished) and validation reports.

## Output

The skill outputs complete Chinese Wikipedia wikitext including:
- Translated article content in Simplified Chinese
- {{NoteTA}} conversion group declarations at the top
- Localized internal links or {{tsl}} templates
- Restored citation templates with ISO date formats
- Translated categories at the bottom

## Requirements

- Access to Wikipedia API (no authentication required)
- Access to Wikidata API (no authentication required)
- LLM service (OpenAI, Anthropic, or compatible provider)
