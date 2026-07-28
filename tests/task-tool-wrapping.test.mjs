import test from 'node:test';
import assert from 'node:assert/strict';

import { z } from 'zod';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';
process.env.LOG_ENABLE_CONSOLE = 'false';
process.env.LOG_ENABLE_FILE = 'false';

const { registerToolTask } = await import('../dist/tools/tool-registry.js');
const { SecureErrorHandler } = await import('../dist/security/secure-error-handler.js');
const { RequestContextManager } = await import('../dist/utils/request-context.js');

function createFakeServer() {
  const logs = [];
  let registered;

  return {
    logs,
    getRegistered() {
      return registered;
    },
    server: {
      async sendLoggingMessage(params) {
        logs.push(params);
      }
    },
    experimental: {
      tasks: {
        registerToolTask(name, meta, handler) {
          registered = { name, meta, handler };
        }
      }
    }
  };
}

test('registerToolTask enforces auth for createTask before invoking the task handler', async () => {
  const fakeServer = createFakeServer();
  let createTaskCalls = 0;

  registerToolTask(
    fakeServer,
    {
      name: 'auth_task_tool',
      title: 'Auth task tool',
      description: 'Requires auth',
      requiresAuth: true,
      inputSchema: z.object({}),
      handler: async () => ({ ok: true }),
      taskRegistration: {
        execution: { taskSupport: 'required' },
        handler: {
          createTask: async () => {
            createTaskCalls += 1;
            return { task: { taskId: 't1', status: 'working', createdAt: '2026-01-01T00:00:00.000Z', lastUpdatedAt: '2026-01-01T00:00:00.000Z', ttl: null } };
          },
          getTask: async () => ({
            task: { taskId: 't1', status: 'working', createdAt: '2026-01-01T00:00:00.000Z', lastUpdatedAt: '2026-01-01T00:00:00.000Z', ttl: null }
          }),
          getTaskResult: async () => ({ content: [{ type: 'text', text: 'done' }] })
        }
      }
    },
    async () => undefined
  );

  const registered = fakeServer.getRegistered();

  await assert.rejects(
    registered.handler.createTask({}, { taskStore: {}, requestId: 'req-1', sendNotification: async () => {}, sendRequest: async () => ({}), sessionId: undefined, signal: AbortSignal.timeout(1000) }),
    /Authentication required/
  );

  assert.equal(createTaskCalls, 0);
  assert.equal(fakeServer.logs.some((entry) => entry.logger === 'octoparse.mcp.tool'), false);
});

test('registerToolTask wraps getTaskResult errors into MCP tool errors and emits failure logs', async () => {
  const fakeServer = createFakeServer();
  const originalLogError = SecureErrorHandler.logError;
  SecureErrorHandler.logError = () => {};

  try {
    registerToolTask(
      fakeServer,
      {
        name: 'result_task_tool',
        title: 'Result task tool',
        description: 'Returns result through task wrapper',
        requiresAuth: false,
        inputSchema: z.object({}),
        handler: async () => ({ ok: true }),
        taskRegistration: {
          execution: { taskSupport: 'required' },
          handler: {
            createTask: async () => ({
              task: { taskId: 't1', status: 'working', createdAt: '2026-01-01T00:00:00.000Z', lastUpdatedAt: '2026-01-01T00:00:00.000Z', ttl: null }
            }),
            getTask: async () => ({
              task: { taskId: 't1', status: 'working', createdAt: '2026-01-01T00:00:00.000Z', lastUpdatedAt: '2026-01-01T00:00:00.000Z', ttl: null }
            }),
            getTaskResult: async () => {
              throw new Error('boom');
            }
          }
        }
      },
      async () => ({
        isAuthenticated: async () => true,
        getUserId: async () => 'user-1'
      })
    );

    const registered = fakeServer.getRegistered();
    const result = await registered.handler.getTaskResult(
      {},
      { taskId: 't1', taskStore: {}, requestId: 'req-1', sendNotification: async () => {}, sendRequest: async () => ({}), sessionId: undefined, signal: AbortSignal.timeout(1000) }
    );

    assert.equal(result.isError, true);
    assert.equal(String(result.content[0].text).includes('UNKNOWN_ERROR'), true);
    assert.equal(fakeServer.logs.some((entry) => entry.logger === 'octoparse.mcp.tool'), false);
  } finally {
    SecureErrorHandler.logError = originalLogError;
  }
});

test('registerToolTask wraps getTask success with task-operation logging', async () => {
  const fakeServer = createFakeServer();

  registerToolTask(
    fakeServer,
    {
      name: 'status_task_tool',
      title: 'Status task tool',
      description: 'Reads task status through wrapper',
      requiresAuth: false,
      inputSchema: z.object({}),
      handler: async () => ({ ok: true }),
      taskRegistration: {
        execution: { taskSupport: 'required' },
        handler: {
          createTask: async () => ({
            task: { taskId: 't1', status: 'working', createdAt: '2026-01-01T00:00:00.000Z', lastUpdatedAt: '2026-01-01T00:00:00.000Z', ttl: null }
          }),
          getTask: async () => ({
            task: { taskId: 't1', status: 'completed', createdAt: '2026-01-01T00:00:00.000Z', lastUpdatedAt: '2026-01-01T00:00:00.000Z', ttl: null }
          }),
          getTaskResult: async () => ({ content: [{ type: 'text', text: 'done' }] })
        }
      }
    },
    async () => undefined
  );

  const registered = fakeServer.getRegistered();
  let context;
  const result = await RequestContextManager.runWithContext(
    {
      requestId: 'req-task-wrapper',
      correlationId: 'corr-task-wrapper',
      startTime: Date.now()
    },
    () => registered.handler.getTask(
      {},
      { taskId: 't1', taskStore: {}, requestId: 'req-1', sendNotification: async () => {}, sendRequest: async () => ({}), sessionId: undefined, signal: AbortSignal.timeout(1000) }
    ).finally(() => {
      context = RequestContextManager.getContext();
    })
  );

  assert.equal(result.task.status, 'completed');
  assert.equal(fakeServer.logs.some((entry) => entry.logger === 'octoparse.mcp.tool'), false);
  assert.equal(context?.toolInput, undefined);
});
