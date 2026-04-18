import { DEFAULTS } from '../config/defaults';

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = DEFAULTS.apiRetries,
  baseDelay: number = DEFAULTS.apiRetryBaseDelay
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === maxRetries - 1) throw error;
      const delay = baseDelay * Math.pow(2, i) + Math.random() * 100; // jitter
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
