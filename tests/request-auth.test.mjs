import test from 'node:test';
import assert from 'node:assert/strict';

const {
  extractBearerToken,
  hasRequestAuthCredentials,
  looksLikeJwtToken,
  extractApiKeyFromHeaders
} = await import('../dist/utils/request-auth.js');

test('extractApiKeyFromHeaders prefers x-api-key', () => {
  const apiKey = extractApiKeyFromHeaders('Bearer ignored-token', 'fake-header-api-key');
  assert.equal(apiKey, 'fake-header-api-key');
});

test('extractApiKeyFromHeaders accepts opaque bearer token as api key', () => {
  const apiKey = extractApiKeyFromHeaders('Bearer fake-bearer-api-key', undefined);
  assert.equal(apiKey, 'fake-bearer-api-key');
});

test('extractApiKeyFromHeaders keeps JWT-like bearer token for JWT flow', () => {
  const jwtLike = 'aaa.bbb.ccc';
  assert.equal(looksLikeJwtToken(jwtLike), true);
  const apiKey = extractApiKeyFromHeaders(`Bearer ${jwtLike}`, undefined);
  assert.equal(apiKey, undefined);
});

test('extractBearerToken trims standard bearer prefix', () => {
  assert.equal(extractBearerToken('Bearer   abc123   '), 'abc123');
});

test('hasRequestAuthCredentials detects supported request credentials', () => {
  assert.equal(hasRequestAuthCredentials('Bearer aaa.bbb.ccc', undefined), true);
  assert.equal(hasRequestAuthCredentials(undefined, 'fake-demo-api-key'), true);
  assert.equal(hasRequestAuthCredentials(undefined, undefined), false);
});
