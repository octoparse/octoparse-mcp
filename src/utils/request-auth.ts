export function extractBearerToken(authHeader?: string): string | undefined {
  if (!authHeader || !/^Bearer\s+/i.test(authHeader)) {
    return undefined;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return token || undefined;
}

export function looksLikeJwtToken(token?: string): boolean {
  if (!token) {
    return false;
  }

  const segments = token.split('.');
  return (
    segments.length === 3 &&
    segments.every((segment) => /^[A-Za-z0-9_-]+$/.test(segment) && segment.length > 0)
  );
}

/**
 * API key header compatibility:
 * 1. x-api-key takes highest priority
 * 2. Authorization: Bearer <opaque-api-key> is treated as API key
 * 3. JWT-like bearer tokens are reserved for JWT auth flow
 */
export function extractApiKeyFromHeaders(
  authHeader?: string,
  xApiKeyHeader?: string
): string | undefined {
  const explicitApiKey = xApiKeyHeader?.trim();
  if (explicitApiKey) {
    return explicitApiKey;
  }

  const bearerToken = extractBearerToken(authHeader);
  if (!bearerToken || looksLikeJwtToken(bearerToken)) {
    return undefined;
  }

  return bearerToken;
}

export function hasRequestAuthCredentials(
  authHeader?: string,
  xApiKeyHeader?: string
): boolean {
  if (extractApiKeyFromHeaders(authHeader, xApiKeyHeader)) {
    return true;
  }

  return !!extractBearerToken(authHeader);
}
