import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';

const { OctoparseApi } = await import('../dist/api/octoparse.js');
const { HttpClientFactory } = await import('../dist/api/clients/http-client-factory.js');
const { OctoparseApiError } = await import('../dist/api/types.js');

test('OctoparseApi.createTemplateTask preserves upstream templateMapping business errors as OctoparseApiError', async () => {
  const originalGetClientApiClient = HttpClientFactory.getClientApiClient;
  HttpClientFactory.getClientApiClient = () => ({
    post: async () => ({
      error: 'TemplateMappingValidationFailed',
      error_description: 'Keyword parameter is invalid for this template.'
    })
  });

  try {
    const api = new OctoparseApi({});

    await assert.rejects(
      () =>
        api.createTemplateTask(
          42,
          'Template Task Error Repro',
          7,
          {
            UIParameters: [{ Id: 'ui-1', Value: ['iphone'] }],
            TemplateParameters: [{ ParamName: 'SearchKeyword', Value: ['iphone'] }]
          },
          undefined,
          undefined,
          {
            templateDetail: {
              id: 42,
              currentVersion: {
                type: 1
              }
            },
            templateVersionDetail: {
              id: 420,
              version: 7,
              parameters: []
            }
          }
        ),
      (error) => {
        assert.equal(error instanceof OctoparseApiError, true);
        assert.equal(error.code, 'TemplateMappingValidationFailed');
        assert.equal(error.description, 'Keyword parameter is invalid for this template.');
        assert.equal(error.message, 'Keyword parameter is invalid for this template.');
        return true;
      }
    );
  } finally {
    HttpClientFactory.getClientApiClient = originalGetClientApiClient;
  }
});
