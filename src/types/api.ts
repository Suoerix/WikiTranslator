export interface ConversionRule {
  simplified: string;
  traditional: string;
  context?: string;
}

export interface ConversionGroup {
  name: string;
  category: string;
  rules: ConversionRule[];
}

export interface WikidataEntity {
  id: string;
  labels: Record<string, string>;
  claims: Record<string, any[]>;
}

export interface ValidationReport {
  isValid: boolean;
  errors: SyntaxError[];
  warnings: SyntaxWarning[];
}

export interface SyntaxError {
  line: number;
  column: number;
  message: string;
  severity: 'error';
}

export interface SyntaxWarning {
  line: number;
  column: number;
  message: string;
  severity: 'warning';
}
