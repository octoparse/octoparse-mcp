import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';

const { SelfCorrectionErrorBuilder } = await import('../dist/errors/self-correction-errors.js');
const messages = (await import('../dist/config/messages.js')).default;

function renderTemplate(template, variables) {
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(variables[key] ?? ''));
}

test('SelfCorrectionErrorBuilder is exposed from the errors domain', () => {
  assert.equal(typeof SelfCorrectionErrorBuilder.cloudTaskPermissionDenied, 'function');
});

test('cloudTaskPermissionDenied uses the shared messages entry for its title text', () => {
  const result = SelfCorrectionErrorBuilder.cloudTaskPermissionDenied({
    currentAccountLevel: 1,
    allowedAccountLevels: [3, 31]
  });

  assert.match(
    result.content[0].text,
    new RegExp(messages.errors.selfCorrection.cloudTaskPermissionDenied.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  assert.match(
    result.content[0].text,
    new RegExp(
      renderTemplate(messages.errors.selfCorrection.cloudTaskPermissionDenied.body.rootCause, {
        currentAccountLevel: 1,
        currentLevelName: 'Free'
      }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
  );
});

test('templateLocalOnly uses the shared messages entry for its title text', () => {
  const result = SelfCorrectionErrorBuilder.templateLocalOnly({
    taskId: 'task-5',
    templateId: 42,
    templateName: 'Amazon Product Scraper'
  });

  assert.match(
    result.content[0].text,
    new RegExp(messages.errors.selfCorrection.templateLocalOnly.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  assert.match(
    result.content[0].text,
    new RegExp(messages.errors.selfCorrection.templateLocalOnly.body.taskLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  assert.match(
    result.content[0].text,
    new RegExp(
      renderTemplate(messages.errors.selfCorrection.templateLocalOnly.body.rootCause, {
        templateId: 42,
        templateName: 'Amazon Product Scraper'
      }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
  );
  assert.deepEqual(result.metadata.filterCriteria, {
    executionMode: 'Cloud'
  });
  assert.match(result.content[0].text, /executionMode/);
  assert.doesNotMatch(result.content[0].text, /Keep templates where `runOn`/);
});

test('parameterValidationFailed uses the shared messages entry for its title text', () => {
  const result = SelfCorrectionErrorBuilder.parameterValidationFailed({
    parameterName: 'SearchKeyword',
    providedValue: 123,
    expectedFormat: 'string',
    example: 'iphone',
    tool: 'execute_task'
  });

  assert.match(
    result.content[0].text,
    new RegExp(messages.errors.selfCorrection.parameterValidationFailed.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
});

