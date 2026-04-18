# WikiTranslator

WikiTranslator 是一个专为 AI Agent 设计的维基百科条目翻译工具链，致力于解决 LLM 在翻译复杂条目时容易出现的格式破坏、链接错误以及模板幻觉等问题。

WikiTranslator 目前的主要设计目标是将英文维基百科条目翻译到中文维基百科。

## 特性

- **引文及标签保护**：预处理时抽离不需要翻译的复杂引文（`{{cite xx}}`系列模板）、标签（`<math>` 等）、逻辑表达式和魔术字，替换为 Placeholder，并在 LLM 翻译完成后重组。
- **链接与模板翻译映射**：集成类 `link-ts` 小工具功能，将英维内部链接和模板名映射到对应的中文页面名称。
- **字词转换组应用**：解析中维通用转换组列表，LLM 判断条目所属的领域并挂载 `{{NoteTA}}` 转换组。
- **废弃模板清理**：清洗掉对中维无用的模板，如 `{{Short description}}`、`{{Italic title}}` 和 `{{lang-zh}}`。
- **日期格式转换**：集成类 `MOSNUM DATES` 小工具功能，将英文日期格式转换为 ISO 格式。

## 工作模式

WikiTranslator 提供以下两种工作模式。

### Standalone API

直接调用内置的 Orchestrator 工作流：

```typescript
import { Orchestrator } from './src/api/orchestrator';

const orchestrator = new Orchestrator();
const result = await orchestrator.execute({
  sourceLanguage: 'en',
  sourceArticle: 'Commodore 64'
});
console.log(result.translatedWikitext);
```

### Agent Skill（IoC）

提供一个标准 `SKILL.md` 文件，可将整个仓库 clone 至本地 skills 目录以安装至 Claude Code 等 CLI 工具中。

原理：WikiTranslator 提供的工具链以 preprocess 和 postprocess 两个入口点作为纯函数供 Agent 调用（Tool as Pure Function）。preprocess 过程生成一个单一 `.wikitext` 任务文件，顶部 YAML Frontmatter 用于传递配置信息（File as State），翻译任务 prompt 采用 HTML 注释格式置于预处理后的 wikitext 之前（File as Mindflow Engine）。Agent 编辑任务文件后，调用 postprocess 生成最终的 `.wikitext` 文件。

## 开发

项目采用 Vite 进行构建，并直接依靠 `tsx` 和 `util.parseArgs` 提供命令行交互支持。

- 安装依赖环境：
  ```bash
  npm install
  ```
- 运行测试或二次打包：
  ```bash
  npm run build
  ```

## 依赖

- [`yaml`](https://github.com/eemeli/yaml): 前置文件解析和状态读写器
- `Zod`: 数据边界验证
- [`wikiparser-node`](https://github.com/bhsd-harry/wikiparser-node): 提供 wikitext 解析和 Lint 能力

## To Do

- [ ] 用 AST 重构 parser
- [ ] 字词转换
  - [ ] 粗颗粒度：实现通用转换组列表攫取、翻译后文本词典比对
  - [ ] 细颗粒度：应支持页面链接的字词转换，应集成类似 [`Module:Conversion rule extractor`](https://zh.wikipedia.org/wiki/Module:Conversion_rule_extractor) 的功能

## License

[GNU GPL-3.0-or-later](LICENSE)