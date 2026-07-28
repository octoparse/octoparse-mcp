import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';
process.env.LOG_ENABLE_CONSOLE = 'false';
process.env.LOG_ENABLE_FILE = 'false';

const { AppConfig } = await import('../dist/config/app-config.js');
const {
  resolveUiClientPolicy,
  isUiMetaAllowedForClient
} = await import('../dist/widget-adapter/ui-client-policy.js');
const { RequestContextManager } = await import('../dist/utils/request-context.js');

async function withUiEnv(env, callback) {
  const previousWidget = process.env.UI_WIDGET_CLIENT_ALLOW_LIST;
  const previousMeta = process.env.UI_META_CLIENT_ALLOW_LIST;

  if ('widget' in env) {
    if (env.widget === undefined) delete process.env.UI_WIDGET_CLIENT_ALLOW_LIST;
    else process.env.UI_WIDGET_CLIENT_ALLOW_LIST = env.widget;
  }
  if ('meta' in env) {
    if (env.meta === undefined) delete process.env.UI_META_CLIENT_ALLOW_LIST;
    else process.env.UI_META_CLIENT_ALLOW_LIST = env.meta;
  }
  AppConfig.reset();

  try {
    return await callback();
  } finally {
    if (previousWidget === undefined) delete process.env.UI_WIDGET_CLIENT_ALLOW_LIST;
    else process.env.UI_WIDGET_CLIENT_ALLOW_LIST = previousWidget;
    if (previousMeta === undefined) delete process.env.UI_META_CLIENT_ALLOW_LIST;
    else process.env.UI_META_CLIENT_ALLOW_LIST = previousMeta;
    AppConfig.reset();
  }
}

test('UI_WIDGET_CLIENT_ALLOW_LIST is read and defaults to openai-mcp', async () => {
  await withUiEnv({ widget: undefined, meta: undefined }, () => {
    assert.deepEqual(AppConfig.getUiConfig().widgetClientAllowList, ['openai-mcp']);
    assert.equal(resolveUiClientPolicy({ clientName: 'openai-mcp' }).widgetMode, 'openai-widget');
  });

  await withUiEnv({ widget: 'custom-client' }, () => {
    assert.deepEqual(AppConfig.getUiConfig().widgetClientAllowList, ['custom-client']);
    assert.equal(resolveUiClientPolicy({ clientName: 'custom-client' }).widgetMode, 'openai-widget');
  });
});

test('UI_META_CLIENT_ALLOW_LIST remains a fallback and new variable wins', async () => {
  await withUiEnv({ widget: undefined, meta: 'legacy-client' }, () => {
    assert.deepEqual(AppConfig.getUiConfig().widgetClientAllowList, ['legacy-client']);
    assert.equal(resolveUiClientPolicy({ clientName: 'legacy-client' }).widgetMode, 'openai-widget');
  });

  await withUiEnv({ widget: 'new-client', meta: 'legacy-client' }, () => {
    assert.deepEqual(AppConfig.getUiConfig().widgetClientAllowList, ['new-client']);
    assert.equal(resolveUiClientPolicy({ clientName: 'new-client' }).widgetMode, 'openai-widget');
    assert.equal(resolveUiClientPolicy({ clientName: 'legacy-client' }).widgetMode, 'inert-widget-resource');
  });
});

test('UiClientPolicy resolves OpenAI and Claude behavior from normalized allow-list', async () => {
  await withUiEnv({ widget: ' openai-mcp , Internal-Client ' }, () => {
    const openaiPolicy = resolveUiClientPolicy({
      clientName: 'OpenAI-MCP',
      clientVersion: '1.2.3'
    });
    assert.deepEqual(openaiPolicy, {
      clientName: 'OpenAI-MCP',
      clientVersion: '1.2.3',
      widgetMode: 'openai-widget',
      allowToolRegistrationMeta: true,
      allowToolResultPresenter: true,
      widgetResource: {
        mimeType: 'text/html;profile=mcp-app',
        includeHtml: true,
        includeOpenAiMeta: true
      }
    });

    const claudePolicy = resolveUiClientPolicy({ clientName: 'Claude Code' });
    assert.equal(claudePolicy.widgetMode, 'inert-widget-resource');
    assert.equal(claudePolicy.allowToolRegistrationMeta, false);
    assert.equal(claudePolicy.allowToolResultPresenter, false);
    assert.equal(claudePolicy.widgetResource.mimeType, 'text/plain');
    assert.equal(isUiMetaAllowedForClient('internal-client'), true);
  });
});

test('UiClientPolicy matches client names with parenthesized display suffixes', async () => {
  await withUiEnv({ widget: 'openai-mcp' }, () => {
    assert.equal(isUiMetaAllowedForClient('openai-mcp (ChatGPT)'), true);
    assert.equal(resolveUiClientPolicy({ clientName: 'openai-mcp (ChatGPT)' }).widgetMode, 'openai-widget');
    assert.equal(isUiMetaAllowedForClient('my-openai-mcp-proxy'), false);
  });
});

test('RequestContext can carry UiClientPolicy', async () => {
  await withUiEnv({ widget: 'openai-mcp' }, () => {
    const uiPolicy = resolveUiClientPolicy({ clientName: 'openai-mcp' });
    return RequestContextManager.runWithContext(
      {
        requestId: 'req-ui-policy',
        correlationId: 'corr-ui-policy',
        startTime: Date.now(),
        clientName: 'openai-mcp',
        uiPolicy
      },
      () => {
        assert.equal(RequestContextManager.getContext().uiPolicy.allowToolResultPresenter, true);
      }
    );
  });
});
