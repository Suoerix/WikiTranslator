export class PlaceholderHelper {
  private static readonly prefixes = {
    ref: '__REF_PLACEHOLDER_',
    math: '__MATH_PLACEHOLDER_',
    code: '__CODE_PLACEHOLDER_',
    syntaxhighlight: '__SYNTAXHIGHLIGHT_PLACEHOLDER_',
    parserFunction: '__PARSER_FUNCTION_'
  };

  static createPlaceholder(type: keyof typeof PlaceholderHelper.prefixes, index: number): string {
    return `${this.prefixes[type]}${index.toString().padStart(3, '0')}__`;
  }

  static isPlaceholder(text: string): boolean {
    return Object.values(this.prefixes).some(prefix => text.includes(prefix));
  }

  static extractPlaceholders(text: string): string[] {
    const rx = /__(?:REF|MATH|CODE|SYNTAXHIGHLIGHT|PARSER_FUNCTION)_PLACEHOLDER_\d+__/g;
    return text.match(rx) || [];
  }
}
