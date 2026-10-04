export class PlaceholderHelper {
  /**
   * Compact @@TYPE:N@@ format to minimise token usage.
   * R  = ref (cite inside <ref>)
   * M  = math
   * C  = code / pre
   * SH = syntaxhighlight
   * PF = parser function / magic word
   * EL = external link  (used by Signpost layer)
   * IW = interwiki link (used by Signpost layer)
   */
  private static readonly prefixes = {
    ref:             '@@R:',
    math:            '@@M:',
    code:            '@@C:',
    syntaxhighlight: '@@SH:',
    parserFunction:  '@@PF:',
    externalLink:    '@@EL:',
    interwiki:       '@@IW:',
  } as const;

  static createPlaceholder(type: keyof typeof PlaceholderHelper.prefixes, index: number): string {
    return `${this.prefixes[type]}${index}@@`;
  }

  static isPlaceholder(text: string): boolean {
    return /@@(?:R|M|C|SH|PF|EL|IW):\d+@@/.test(text);
  }

  static extractPlaceholders(text: string): string[] {
    const rx = /@@(?:R|M|C|SH|PF|EL|IW):\d+@@/g;
    return text.match(rx) || [];
  }
}
