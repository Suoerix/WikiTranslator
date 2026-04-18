import { WikitextParser } from '../parsers/wikitext';
import { ValidationReport, SyntaxError, SyntaxWarning } from '../types/api';

export class SyntaxCheckModule {
  validate(wikitext: string): ValidationReport {
    const errors: SyntaxError[] = [];
    const warnings: SyntaxWarning[] = [];
    
    try {
      const lintResults = WikitextParser.lint(wikitext);
      
      lintResults.forEach(result => {
        if (result.severity === 'error') {
          errors.push({
            line: result.line || 0,
            column: result.column || 0,
            message: result.message || 'Unknown error',
            severity: 'error',
          });
        } else {
          warnings.push({
            line: result.line || 0,
            column: result.column || 0,
            message: result.message || 'Unknown warning',
            severity: 'warning',
          });
        }
      });
      
      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error: any) {
      return {
        isValid: false,
        errors: [{
          line: 0,
          column: 0,
          message: `Parse error: ${error.message || String(error)}`,
          severity: 'error',
        }],
        warnings: [],
      };
    }
  }
}
