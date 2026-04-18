export class MemoryStorage {
  private storage = new Map<string, any>();

  async save(filePath: string, state: any): Promise<void> {
    this.storage.set(filePath, state);
  }

  async load(filePath: string): Promise<any> {
    const state = this.storage.get(filePath);
    if (!state) {
      throw new Error(`Session not found: ${filePath}`);
    }
    return JSON.parse(JSON.stringify(state));
  }

  async delete(filePath: string): Promise<void> {
    this.storage.delete(filePath);
  }
}
