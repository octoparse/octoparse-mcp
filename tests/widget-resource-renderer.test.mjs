import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';
process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://widgets.example.com';

const { resolveUiClientPolicy } = await import('../dist/widget-adapter/ui-client-policy.js');
const {
  renderWidgetResource,
  widgetResourceDefinitions
} = await import('../dist/widget-adapter/widget-resource-renderer.js');
const { registerAllResources } = await import('../dist/resources.js');

test('OpenAI policy renders widget HTML and OpenAI metadata', async () => {
  const def = widgetResourceDefinitions.find((resource) => resource.uri === 'ui://widget/search-templates.html');
  const rendered = renderWidgetResource(def, resolveUiClientPolicy({ clientName: 'openai-mcp' }));

  assert.equal(rendered.mimeType, 'text/html;profile=mcp-app');
  assert.match(rendered.text, /search-templates\.js/);
  assert.equal(rendered._meta.ui.prefersBorder, true);
  assert.equal(rendered._meta['openai/widgetDomain'], 'https://widgets.example.com');
  assert.deepEqual(rendered._meta['openai/widgetCSP'], rendered._meta.ui.csp);
});

test('inert policy renders text/plain empty fallback without metadata', async () => {
  const def = widgetResourceDefinitions.find((resource) => resource.uri === 'ui://widget/search-templates.html');
  const rendered = renderWidgetResource(def, resolveUiClientPolicy({ clientName: 'Claude Code' }));

  assert.equal(rendered.mimeType, 'text/plain');
  assert.equal(rendered.text, '');
  assert.equal('_meta' in rendered, false);
});

test('registerAllResources keeps widget URIs readable for inert policy', async () => {
  const registered = [];
  registerAllResources({
    registerResource(name, uri, meta, handler) {
      registered.push({ name, uri, meta, handler });
    }
  }, {
    uiPolicy: resolveUiClientPolicy({ clientName: 'Claude Code' })
  });

  const searchTemplatesResource = registered.find((entry) => entry.uri === 'ui://widget/search-templates.html');
  const searchTasksResource = registered.find((entry) => entry.uri === 'ui://widget/search-tasks.html');
  assert.ok(searchTemplatesResource);
  assert.ok(searchTasksResource);

  const response = await searchTemplatesResource.handler();
  assert.equal(searchTemplatesResource.meta.mimeType, 'text/plain');
  assert.equal(response.contents[0].text, '');
  assert.equal(response.contents[0]._meta, undefined);
});
