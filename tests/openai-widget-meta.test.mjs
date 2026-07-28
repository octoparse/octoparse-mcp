import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';
process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://widgets.example.com';

const {
  buildOpenAiToolRegistrationMeta,
  buildOpenAiWidgetResultMeta,
  buildOpenAiWidgetResourceMeta
} = await import('../dist/widget-adapter/openai-widget-meta.js');

test('OpenAI tool registration metadata shape is stable', () => {
  const meta = buildOpenAiToolRegistrationMeta({
    title: 'Template Search',
    resourceUri: 'ui://widget/search-templates.html',
    widgetAccessible: true,
    invokingText: 'Searching...',
    invokedText: 'Ready.'
  });

  assert.deepEqual(meta, {
    ui: {
      resourceUri: 'ui://widget/search-templates.html'
    },
    'openai/outputTemplate': 'ui://widget/search-templates.html',
    'openai/widgetAccessible': true,
    'openai/toolInvocation/invoking': 'Searching...',
    'openai/toolInvocation/invoked': 'Ready.'
  });
});

test('OpenAI widget result metadata shape is stable', () => {
  const meta = buildOpenAiWidgetResultMeta({
    resourceUri: 'ui://widget/search-templates.html',
    widgetAccessible: true,
    widgetData: { cards: [{ id: 'card-1' }] }
  });

  assert.equal(meta.ui.resourceUri, 'ui://widget/search-templates.html');
  assert.equal(meta['openai/outputTemplate'], 'ui://widget/search-templates.html');
  assert.equal(meta['openai/resultCanProduceWidget'], true);
  assert.equal(meta['openai/widgetAccessible'], true);
  assert.deepEqual(meta.cards, [{ id: 'card-1' }]);
});

test('OpenAI widget resource metadata shape is stable', () => {
  const meta = buildOpenAiWidgetResourceMeta('Widget description');

  assert.equal(meta['openai/widgetDescription'], 'Widget description');
  assert.equal(meta.ui.domain, 'https://widgets.example.com');
  assert.equal(meta['openai/widgetDomain'], 'https://widgets.example.com');
  assert.deepEqual(meta['openai/widgetCSP'], meta.ui.csp);
});
