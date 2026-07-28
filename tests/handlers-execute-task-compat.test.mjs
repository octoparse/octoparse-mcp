import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';

const { maybeHandleDirectPlainToolCall } = await import('../dist/handlers.js');
const { transportManager } = await import('../dist/transport.js');

function createMockResponse() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('maybeHandleDirectPlainToolCall short-circuits plain tools/call requests for tools that opt into direct plain execution', async () => {
  const originalHasTransport = transportManager.hasTransport;
  let transportTouches = 0;
  transportManager.hasTransport = () => {
    transportTouches += 1;
    return true;
  };

  const req = {
    body: {
      method: 'tools/call',
      params: {
        name: 'custom_direct_tool',
        arguments: {
          templateName: 'google-search-scraper'
        }
      }
    }
  };
  const res = createMockResponse();
  const selectedTools = [{ name: 'custom_direct_tool', plainCallExecution: 'direct' }];
  const executorCalls = [];

  try {
    const handled = await maybeHandleDirectPlainToolCall({
      req,
      res,
      requestRpcId: 'rpc-1',
      sessionId: 'session-1',
      userInfo: { id: 'user-1', username: 'alice' },
      authHeaderForJwt: undefined,
      apiKey: 'api-key-1',
      selectedTools,
      executeTool: async (...args) => {
        executorCalls.push(args);
        return {
          content: [
            {
              type: 'text',
              text: 'accepted'
            }
          ]
        };
      }
    });

    assert.equal(handled, true);
    assert.equal(transportTouches, 1);
    assert.equal(executorCalls.length, 1);
    assert.deepEqual(executorCalls[0].slice(0, 2), [
      selectedTools[0],
      {
        templateName: 'google-search-scraper'
      }
    ]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      jsonrpc: '2.0',
      result: {
        content: [
          {
            type: 'text',
            text: 'accepted'
          }
        ]
      },
      id: 'rpc-1'
    });
  } finally {
    transportManager.hasTransport = originalHasTransport;
  }
});

test('maybeHandleDirectPlainToolCall ignores explicit task-mode calls even for direct-plain tools', async () => {
  const req = {
    body: {
      method: 'tools/call',
      params: {
        name: 'custom_direct_tool',
        arguments: {
          templateName: 'google-search-scraper'
        },
        task: {
          ttl: 60_000
        }
      }
    }
  };
  const res = createMockResponse();

  const handled = await maybeHandleDirectPlainToolCall({
    req,
    res,
    requestRpcId: 'rpc-2',
    selectedTools: [{ name: 'custom_direct_tool', plainCallExecution: 'direct' }],
    executeTool: async () => {
      throw new Error('executeTool should not be called for task-mode requests');
    }
  });

  assert.equal(handled, false);
  assert.equal(res.statusCode, undefined);
  assert.equal(res.body, undefined);
});

test('maybeHandleDirectPlainToolCall ignores plain tools/call requests when the tool does not opt into direct plain execution', async () => {
  const req = {
    body: {
      method: 'tools/call',
      params: {
        name: 'execute_task',
        arguments: {
          templateName: 'google-search-scraper'
        }
      }
    }
  };
  const res = createMockResponse();

  const handled = await maybeHandleDirectPlainToolCall({
    req,
    res,
    requestRpcId: 'rpc-3',
    selectedTools: [{ name: 'execute_task' }],
    executeTool: async () => {
      throw new Error('executeTool should not be called when plainCallExecution is not direct');
    }
  });

  assert.equal(handled, false);
  assert.equal(res.statusCode, undefined);
  assert.equal(res.body, undefined);
});
