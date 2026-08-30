// Error normalization shared by all provider paths. Wraps the AI SDK's
// `APICallError` and bare `Error` instances into our domain-level
// `ChatProviderError` with a user-friendlier message when possible.

import { APICallError } from 'ai';
import { ChatProviderError, type ProviderId } from '../../index';

export function normalizeError(err: unknown, providerId: ProviderId): ChatProviderError {
  if (err instanceof ChatProviderError) return err;
  if (APICallError.isInstance(err)) {
    return new ChatProviderError({
      provider: providerId,
      status: err.statusCode,
      message: friendlyMessage(err.statusCode, err.message),
      retryable: err.isRetryable,
    });
  }
  if (err instanceof Error) {
    return new ChatProviderError({ provider: providerId, message: err.message });
  }
  return new ChatProviderError({ provider: providerId, message: String(err) });
}

export function friendlyMessage(status: number | undefined, fallback: string): string {
  if (status === 401 || status === 403) return 'API key rejected. Double-check the key in settings.';
  if (status === 429) return 'Rate limit hit. Try again in a moment.';
  if (status === 400) return fallback || 'The request was rejected by the provider.';
  if (status && status >= 500) return 'The provider returned a server error. Try again shortly.';
  return fallback || 'The request failed.';
}

export async function readErrorBody(res: Response): Promise<string> {
  try {
    const raw = await res.text();
    if (!raw) return `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.error?.message === 'string') return parsed.error.message;
      if (typeof parsed?.message === 'string') return parsed.message;
    } catch {
      // fall through
    }
    return raw;
  } catch {
    return `HTTP ${res.status}`;
  }
}
