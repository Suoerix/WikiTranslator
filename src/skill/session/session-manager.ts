import { FileStorage } from './storage/file-storage';
import { MemoryStorage } from './storage/memory-storage';
import { Category } from '../../types/wikitext';

export interface SessionState {
  sessionId: string;
  timestamp: string;
  sourceLanguage: string;
  sourceArticle: string;
  targetArticle?: string;
  placeholderMap: Record<string, string>;
  removedCategories: Category[];
  glossary?: Record<string, string>;
  appliedConversionGroups: string[];
  translationPrompt: string;
  conversionPrompt: string;
  wikitext: string;
}

export class SessionManager {
  private storage: FileStorage | MemoryStorage;

  constructor(useFileStorage = true) {
    this.storage = useFileStorage ? new FileStorage() : new MemoryStorage();
  }

  async save(filePath: string, state: SessionState): Promise<void> {
    await this.storage.save(filePath, state);
  }

  async load(filePath: string): Promise<SessionState> {
    const raw = await this.storage.load(filePath);
    // map placeholder obj back to Record
    return raw as SessionState;
  }

  async delete(filePath: string): Promise<void> {
    await this.storage.delete(filePath);
  }
}
