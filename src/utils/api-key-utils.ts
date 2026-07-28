import { createHash } from 'crypto';

/**
 * Compute API Key ID using SHA-1 hash
 * Used for logging/analytics without exposing the actual API key
 *
 * @param apiKey - The raw API key
 * @returns 40-character lowercase hex string (SHA-1 digest)
 */
export function computeApiKeyId(apiKey: string): string {
  return createHash('sha1').update(apiKey, 'utf8').digest('hex');
}
