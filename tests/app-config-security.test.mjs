import test from 'node:test';
import assert from 'node:assert/strict';

const REMOVED_SECURITY_KEYS = [
  'jwtSecret',
  'jwtVerifySignature',
  'sessionSecret',
  'encryptionKey',
  'maxRequestsPerMinute',
  'maxRequestSize',
  'enableCors',
  'bcryptRounds',
  'maxLoginAttempts',
  'lockoutDuration',
  'tokenExpiration',
  'requireHttps',
  'enableHsts',
  'enableCsp',
  'rateLimitWindowMs',
  'rateLimitMaxRequests'
];

let appConfigImportCounter = 0;

async function importFreshAppConfig() {
  appConfigImportCounter += 1;
  return await import(`../dist/config/app-config.js?test=${appConfigImportCounter}`);
}

async function withEnvOverride(overrides, callback) {
  const previousValues = new Map();

  for (const [key, value] of Object.entries(overrides)) {
    previousValues.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previousValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('AppConfig security config no longer exposes removed legacy security fields', async () => {
  const { AppConfig } = await importFreshAppConfig();

  AppConfig.reset();
  const securityConfig = AppConfig.getSecurityConfig();

  for (const key of REMOVED_SECURITY_KEYS) {
    assert.equal(key in securityConfig, false, `expected "${key}" to be absent from security config`);
  }
});

test('sanitized config omits removed legacy security fields', async () => {
  const { AppConfig } = await importFreshAppConfig();

  AppConfig.reset();
  const sanitized = AppConfig.getSanitizedConfig();
  const securityConfig = sanitized.security ?? {};

  for (const key of REMOVED_SECURITY_KEYS) {
    assert.equal(key in securityConfig, false, `expected "${key}" to be absent from sanitized security config`);
  }
});

test('AppConfig no longer falls back to localhost when PUBLIC_BASE_URL is missing', async () => {
  const { AppConfig } = await importFreshAppConfig();

  await withEnvOverride({
    PUBLIC_BASE_URL: undefined,
    CLIENTAPI_BASE_URL: 'https://client-api.example.com',
    OFFICIAL_SITE_URL: 'https://octoparse.example.com',
    OFFICIAL_UPGRADE_URL: 'https://octoparse.example.com/pricing',
    OFFICIAL_DOWNLOAD_URL: 'https://octoparse.example.com/download'
  }, async () => {
    AppConfig.reset();

    assert.equal(AppConfig.getServerConfig().publicBaseUrl, '');
    assert.throws(() => AppConfig.validateConfig(), /PUBLIC_BASE_URL/i);
  });
});

test('AppConfig preserves ALLOWED_ORIGINS=* as a true CORS wildcard instead of a literal array entry', async () => {
  const { AppConfig } = await importFreshAppConfig();

  await withEnvOverride({
    ALLOWED_ORIGINS: '*'
  }, async () => {
    AppConfig.reset();

    assert.equal(AppConfig.getSecurityConfig().allowedOrigins, '*');
  });
});
