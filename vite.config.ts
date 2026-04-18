import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import dts from 'vite-plugin-dts';

// Plugin to embed markdown files as strings at build time
function embedPrompts() {
  const promptsDir = resolve(__dirname, 'src/core/prompts');
  const prompts: Record<string, string> = {};
  
  return {
    name: 'embed-prompts',
    buildStart() {
      if (fs.existsSync(promptsDir)) {
        const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
        files.forEach(file => {
          const name = file.replace('.md', '');
          const content = fs.readFileSync(resolve(promptsDir, file), 'utf-8');
          prompts[name] = content;
        });
      }
    },
    transform(code: string, id: string) {
      // Replace PROMPTS_PLACEHOLDER in src/core/prompts/index.ts
      if (id.replace(/\\/g, '/').endsWith('src/core/prompts/index.ts')) {
        const promptsJson = JSON.stringify(prompts, null, 2);
        return {
          code: code.replace(
            '/* PROMPTS_PLACEHOLDER */',
            `const EMBEDDED_PROMPTS: Record<string, string> = ${promptsJson};`
          ),
        };
      }
    },
  };
}

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        preprocess: resolve(__dirname, 'src/skill/tools/preprocess.ts'),
        postprocess: resolve(__dirname, 'src/skill/tools/postprocess.ts'),
        standalone: resolve(__dirname, 'src/api/translator.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        'wikiparser-node',
        'ai',
        '@ai-sdk/openai',
        '@ai-sdk/anthropic',
        'zod',
        'fs',
        'path',
        'url',
        'crypto',
      ],
    },
    sourcemap: true,
  },
  plugins: [embedPrompts(), dts()],
});
