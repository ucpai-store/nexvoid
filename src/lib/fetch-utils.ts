/**
 * Fetch with automatic retry for handling server restarts
 * This is crucial because the Next.js server may crash and restart
 * during concurrent requests in the sandbox environment.
 */

interface FetchOptions extends RequestInit {
  maxRetries?: number;
  retryDelay?: number;
}

export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { maxRetries = 3, retryDelay = 1000, ...fetchOptions } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);
      // If we get a response (even an error), return it
      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        // Wait before retrying, with exponential backoff
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

/**
 * Helper to make authenticated API calls with retry
 */
export async function adminFetch(
  url: string,
  token: string,
  options: FetchOptions = {}
): Promise<Response> {
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
  };

  return fetchWithRetry(url, {
    ...options,
    headers,
    maxRetries: options.maxRetries ?? 2,
    retryDelay: options.retryDelay ?? 500,
  });
}
