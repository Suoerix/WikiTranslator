export class WikiTranslatorError extends Error {
  constructor(
    public module: string,
    public code: string,
    public details?: any
  ) {
    super(`[${module}] ${code}: ${details ? JSON.stringify(details) : ''}`);
    this.name = 'WikiTranslatorError';
  }
}
