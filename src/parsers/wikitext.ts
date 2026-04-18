import Parser from 'wikiparser-node';

export class WikitextParser {
  static parse(text: string): any {
    try {
      return Parser.parse(text);
    } catch (err) {
      throw new Error(`Failed to parse wikitext: ${(err as Error).message}`);
    }
  }

  static lint(text: string): any[] {
    const ast = this.parse(text);
    return ast.lint?.() || []; // wikiparser-node provides lint()
  }
}
