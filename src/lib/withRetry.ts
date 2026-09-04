// Retries a transient failure with exponential backoff + jitter.
// Found via load testing (SUPABASE_MIGRATION.md): under a burst of concurrent
// resume uploads, Supabase Storage's own connection pool can return a 429
// "Too many connections issued to the database" -- a transient capacity
// limit, not a real failure. Retrying briefly resolves the vast majority.
export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelayMs = 200, isRetryable = (e: any) => true }: {
    retries?: number;
    baseDelayMs?: number;
    isRetryable?: (error: any) => boolean;
  } = {}
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt === retries || !isRetryable(error)) throw error;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Supabase Storage's transient "too many connections" capacity limit.
export const isTransientStorageError = (error: any) =>
  error?.statusCode === '429' || error?.status === 429;
