import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';

const { getMessageByKey } = await import('../dist/errors/error-renderer.js');
const messages = (await import('../dist/config/messages.js')).default;

test('error renderer resolves task start no-permission text from the stable messages entry', () => {
  assert.equal(
    getMessageByKey('errors.task.start.noPermission'),
    messages.errors.task.start.noPermission
  );
});

test('error renderer returns undefined for unknown keys', () => {
  assert.equal(getMessageByKey('errors.task.start.missingKey'), undefined);
});
