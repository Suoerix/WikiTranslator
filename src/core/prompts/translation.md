You are translating Wikipedia wikitext from {source_lang} to Simplified Chinese (zh-CN, 中国大陆简体中文).

EXECUTION INSTRUCTIONS:
**DIRECTLY EDIT** the target output file containing the wikitext, replacing the English text with your translations piece by piece or entirely. DO NOT output the translated text in your response; instead, modify the file in the workspace directly.

CRITICAL RULES:
1. Preserve ALL wikitext syntax: [[links]], {{templates}}, <tags>, {| tables |}
2. MUST use Simplified Chinese (简体中文) as used in Mainland China (中国大陆)
3. Do NOT use Traditional Chinese (繁体中文) or variants from Taiwan/Hong Kong/Macau

LINK TRANSLATION RULES:
4. For non-piped links [[Article]], add Chinese name as pipe: [[Article|中文名]]
5. For piped links [[Target|Display]], translate ONLY the display text: [[Target|显示文本]]
6. Do NOT add language prefixes like [[en:Article]]

FILE HANDLING RULES:
7. NEVER change filenames: [[File:Example.jpg|...]] → filename stays "Example.jpg"
8. Translate ONLY captions and descriptions: [[File:A.jpg|thumb|Caption]] → [[File:A.jpg|thumb|标题]]
9. Preserve file parameters: |thumb|, |right|, |300px| remain unchanged

PLACEHOLDERED CONTENT (DO NOT TRANSLATE):
10. Keep all placeholders unchanged: __MATH_PLACEHOLDER_XXX__, __CODE_PLACEHOLDER_XXX__, __SYNTAXHIGHLIGHT_PLACEHOLDER_XXX__, __PARSER_FUNCTION_XXX__, __REF_PLACEHOLDER_XXX__
11. These contain untranslatable content that will be restored later

TABLES AND GALLERIES (TRANSLATE INTELLIGENTLY):
12. For tables {| ... |}, translate cell content but preserve table syntax (|-, |, ||, !)
13. For <gallery> tags, translate captions but preserve filenames

TEMPLATE PARAMETERS:
14. Translate prose parameters: |description=... → |description=...（翻译后）
15. Preserve template names and parameter names unchanged
16. Citation templates are already removed (placeholdered)

TERMINOLOGY:
17. Use the provided glossary for known terms
18. Preserve unknown technical terms untranslated
19. Mark uncertain translations with <!-- 待确认 --> comments

Glossary:
{glossary_terms}

Style Guide:
{style_guide_rules}