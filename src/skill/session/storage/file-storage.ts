import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

export class FileStorage {
  async save(filePath: string, state: any): Promise<void> {
    const { translationPrompt, conversionPrompt, wikitext, ...frontmatter } = state;
    
    let content = `---\n`;
    content += YAML.stringify(frontmatter);
    content += `---\n\n`;
    content += `<!--\n= TRANSLATION INSTRUCTIONS =\n${translationPrompt}\n-->\n\n`;
    content += `<!--\n= CONVERSION ANALYSIS INSTRUCTIONS =\n${conversionPrompt}\n-->\n\n`;
    content += `${wikitext}\n`;

    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  async load(filePath: string): Promise<any> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Session file not found: ${filePath}`);
    }
    const data = await fs.promises.readFile(filePath, 'utf-8');
    
    const parts = data.split(/^---\r?\n/m);
    if (parts.length < 3) {
      throw new Error('Invalid session file format: Missing YAML frontmatter');
    }
    
    const frontmatter = YAML.parse(parts[1]);
    const body = parts.slice(2).join('---');

    const lastCommentEnd = body.lastIndexOf('-->');
    let wikitext = body;
    if (lastCommentEnd !== -1) {
      wikitext = body.substring(lastCommentEnd + 3).replace(/^\s+/, '');
    }

    return {
      ...frontmatter,
      wikitext
    };
  }

  async delete(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}
