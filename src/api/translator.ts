import { Orchestrator } from './orchestrator';
import { TranslationConfig, TranslationResult } from '../types/config';

export class WikiTranslator {
  private orchestrator: Orchestrator;

  constructor(config?: Partial<TranslationConfig>) {
    this.orchestrator = new Orchestrator(config);
  }

  async translate(config: TranslationConfig): Promise<TranslationResult> {
    return this.orchestrator.execute(config);
  }
}
