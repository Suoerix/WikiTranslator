import { loadEnv } from '../config/env';

const env = loadEnv();

export const logger = {
  debug: (...args: any[]) => {
    if (env.LOG_LEVEL === 'debug') console.debug('[DEBUG]', ...args);
  },
  info: (...args: any[]) => {
    if (['debug', 'info'].includes(env.LOG_LEVEL)) console.info('[INFO]', ...args);
  },
  warn: (...args: any[]) => {
    if (['debug', 'info', 'warn'].includes(env.LOG_LEVEL)) console.warn('[WARN]', ...args);
  },
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
  }
};
