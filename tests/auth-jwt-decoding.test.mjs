import test from 'node:test';
import assert from 'node:assert/strict';

function encodeBase64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function buildJwtLikeToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  return `${encodeBase64Url(header)}.${encodeBase64Url(payload)}.invalid-signature`;
}

test('auth module only exposes JWT decode helpers and not verifyJWTToken', async () => {
  const authModule = await import('../dist/auth.js');

  assert.equal(typeof authModule.parseJWTToken, 'function');
  assert.equal(typeof authModule.getTokenExpiration, 'function');
  assert.equal(typeof authModule.isTokenExpired, 'function');
  assert.equal('verifyJWTToken' in authModule, false);
});

test('parseJWTToken decodes user info from JWT-like bearer token without local verification', async () => {
  const { parseJWTToken } = await import('../dist/auth.js');
  const token = buildJwtLikeToken({
    sub: 'user-123',
    username: 'demo-user',
    email: 'demo@example.com',
    iss: 'https://issuer.example.com',
    scope: 'openid profile'
  });

  const userInfo = parseJWTToken(`Bearer ${token}`);

  assert.deepEqual(userInfo, {
    id: 'user-123',
    username: 'demo-user',
    email: 'demo@example.com',
    issuer: 'https://issuer.example.com',
    scope: 'openid profile',
    rule: undefined
  });
});
