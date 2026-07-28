import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';
process.env.LOG_ENABLE_CONSOLE = 'false';
process.env.LOG_ENABLE_FILE = 'false';

const { executeToolWithMiddleware } = await import('../dist/tools/tool-registry.js');
const { RequestContextManager } = await import('../dist/utils/request-context.js');
const { resolveUiClientPolicy } = await import('../dist/widget-adapter/ui-client-policy.js');

function createTool(state, handler) {
  return {
    name: 'widget_tool',
    title: 'Widget tool',
    description: 'Widget-enabled tool',
    requiresAuth: false,
    inputSchema: z.object({ keyword: z.string() }),
    uiBinding: {
      resourceUri: 'ui://widget/search-templates.html',
      presenter(result) {
        state.presenterCalls += 1;
        return {
          content: [{ type: 'text', text: `presented ${result.keyword}` }],
          structuredContent: result,
          _meta: {
            'openai/outputTemplate': 'ui://widget/search-templates.html'
          }
        };
      }
    },
    handler
  };
}

async function runWithPolicy(clientName, tool) {
  const uiPolicy = resolveUiClientPolicy({ clientName });
  return RequestContextManager.runWithContext(
    {
      requestId: `req-${clientName}`,
      correlationId: `corr-${clientName}`,
      startTime: Date.now(),
      clientName,
      uiPolicy
    },
    () => executeToolWithMiddleware(tool, async () => undefined, { keyword: 'maps' })
  );
}

test('OpenAI policy presents plain objects and ApiResponse-like results', async () => {
  const plainState = { presenterCalls: 0 };
  const plainResult = await runWithPolicy(
    'openai-mcp',
    createTool(plainState, async (input) => ({ keyword: input.keyword }))
  );
  assert.equal(plainState.presenterCalls, 1);
  assert.equal(plainResult._meta['openai/outputTemplate'], 'ui://widget/search-templates.html');

  const apiState = { presenterCalls: 0 };
  const apiResult = await runWithPolicy(
    'openai-mcp',
    createTool(apiState, async (input) => ({ success: true, keyword: input.keyword }))
  );
  assert.equal(apiState.presenterCalls, 1);
  assert.equal(apiResult._meta['openai/outputTemplate'], 'ui://widget/search-templates.html');
});

test('existing CallToolResult is not presented again', async () => {
  const state = { presenterCalls: 0 };
  const result = await runWithPolicy(
    'openai-mcp',
    createTool(state, async () => ({
      content: [{ type: 'text', text: 'already formatted' }],
      structuredContent: { keyword: 'maps' }
    }))
  );

  assert.equal(state.presenterCalls, 0);
  assert.equal(result.content[0].text, 'already formatted');
  assert.equal('_meta' in result, false);
});

test('Claude inert policy never invokes widget presenter', async () => {
  const state = { presenterCalls: 0 };
  const result = await runWithPolicy(
    'Claude Code',
    createTool(state, async (input) => ({ success: true, keyword: input.keyword }))
  );

  assert.equal(state.presenterCalls, 0);
  assert.equal('_meta' in result, false);
  assert.match(result.content[0].text, /"keyword": "maps"/);
});
