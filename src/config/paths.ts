import { resolve } from 'path';
import { loadEnv } from './env';

const env = loadEnv();

export const PATHS = {
  sessionDir: resolve(process.cwd(), env.SESSION_DIR),
  outputDir: resolve(process.cwd(), 'translations'),
  configDir: resolve(process.cwd(), 'config'),
};
