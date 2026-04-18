export class DateNormalizationModule {
  private readonly dateParams = ['date', 'access-date', 'archive-date', 'publication-date', 'issue-date'];
  private readonly monthNames: Record<string, string> = {
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'may': '05', 'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12',
  };

  normalizeDates(wikitext: string): string {
    const paramPrefix = `(\\|\\s*(?:${this.dateParams.join('|')})\\s*=\\s*)`;
    let result = wikitext;
    
    // 1. Day Month, YYYY
    result = result.replace(
      new RegExp(paramPrefix + '(\\d{1,2})\\s+(\\w+),?\\s+(\\d{4})', 'gi'),
      (match, prefix, day, month, year) => {
        const monthNum = this.monthNames[month.toLowerCase()];
        if (!monthNum) return match;
        return `${prefix}${year}-${monthNum}-${day.padStart(2, '0')}`;
      }
    );

    // 2. Month Day, YYYY
    result = result.replace(
      new RegExp(paramPrefix + '(\\w+)\\s+(\\d{1,2}),?\\s+(\\d{4})', 'gi'),
      (match, prefix, month, day, year) => {
        const monthNum = this.monthNames[month.toLowerCase()];
        if (!monthNum) return match;
        return `${prefix}${year}-${monthNum}-${day.padStart(2, '0')}`;
      }
    );

    // 3. YYYY/MM/DD or YYYY.MM.DD
    result = result.replace(
      new RegExp(paramPrefix + '(\\d{4})[./](\\d{1,2})[./](\\d{1,2})', 'gi'),
      (match, prefix, year, month, day) => {
        return `${prefix}${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    );

    // 4. DD/MM/YYYY or DD.MM.YYYY (UK style, year > 12 to avoid MM/DD/YYYY conflict usually handled safely contextually. Assume year is 4 digits)
    result = result.replace(
      new RegExp(paramPrefix + '(\\d{1,2})[./](\\d{1,2})[./](\\d{4})', 'gi'),
      (match, prefix, first, second, year) => {
        // Without clear distinction, we favor DD/MM/YYYY for Wikipedia often, or check limits.
        // Let's assume first is Day and second is Month based on design doc patterns.
        if (parseInt(year) > 12) {
          // just swap them to ISO
          return `${prefix}${year}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`;
        }
        return match;
      }
    );

    // 6. YYYY年MM月DD日
    result = result.replace(
      new RegExp(paramPrefix + '(\\d{4})年(\\d{1,2})月(\\d{1,2})日', 'gi'),
      (match, prefix, year, month, day) => {
        return `${prefix}${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    );

    return result;
  }
}
