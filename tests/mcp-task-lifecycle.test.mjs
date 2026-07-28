import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';
process.env.SEARCH_TEMPLATE_PAGE_SIZE = process.env.SEARCH_TEMPLATE_PAGE_SIZE || '8';
process.env.EXECUTE_TASK_POLL_MAX_MINUTES = process.env.EXECUTE_TASK_POLL_MAX_MINUTES || '10';

const { InMemoryExecutionTaskStore } = await import('../dist/tasks/execution-task-store.js');
const { InMemoryExecutionTaskAuthStore } = await import('../dist/tasks/execution-task-auth.js');
const { ExecutionTaskWorker } = await import('../dist/tasks/execution-task-worker.js');
const { ExecutionTaskService } = await import('../dist/tasks/execution-task-service.js');
const { StartTaskResult } = await import('../dist/api/types.js');

function createRequest(id, args = { templateName: 'amazon-cloud' }) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name: 'execute_task',
      arguments: args
    }
  };
}

function createRequestTaskStore(store, requestId, request, sessionId) {
  return {
    createTask: (taskParams) => store.createTask(taskParams, requestId, request, sessionId),
    getTask: async (taskId) => {
      const task = await store.getTask(taskId, sessionId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      return task;
    },
    storeTaskResult: (taskId, status, result) =>
      store.storeTaskResult(taskId, status, result, sessionId),
    getTaskResult: (taskId) => store.getTaskResult(taskId, sessionId),
    updateTaskStatus: (taskId, status, statusMessage) =>
      store.updateTaskStatus(taskId, status, statusMessage, sessionId),
    listTasks: (cursor) => store.listTasks(cursor, sessionId)
  };
}

function createPreparedExecution(overrides = {}) {
  return {
    templateId: 42,
    templateName: 'amazon-cloud',
    taskName: 'Amazon Background Run',
    userInputParameters: {
      UIParameters: [],
      TemplateParameters: [
        {
          ParamName: 'SearchKeyword',
          Value: ['iphone']
        }
      ]
    },
    templateView: {
      id: 42,
      runOn: 2,
      name: 'Amazon Cloud',
      currentVersion: {
        templateVersionId: 420,
        version: 7,
        type: 1
      }
    },
    templateVersionDetail: {
      id: 420,
      version: 7,
      templateId: 42
    },
    parameterKeyMappings: [],
    ignoredParameterKeys: [],
    ...overrides
  };
}

async function waitFor(assertion, options = {}) {
  const timeoutMs = options.timeoutMs ?? 500;
  const intervalMs = options.intervalMs ?? 10;
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw lastError ?? new Error('Timed out waiting for assertion.');
}

test('ExecutionTaskService getTask/getTaskResult reflect a cancelled task once the worker stores the cancellation payload', async () => {
  const store = new InMemoryExecutionTaskStore({
    generateTaskId: () => 'mcp-task-lifecycle-1'
  });
  const authStore = new InMemoryExecutionTaskAuthStore({
    generateHandleId: () => 'handle-lifecycle-1'
  });
  const request = createRequest('request-lifecycle-1', {
    templateName: 'amazon-cloud',
    parameters: {
      keyword: ['iphone']
    }
  });
  const requestTaskStore = createRequestTaskStore(
    store,
    'request-lifecycle-1',
    request,
    'session-lifecycle-1'
  );
  const task = await requestTaskStore.createTask({
    ttl: 60_000
  });
  authStore.createHandle({
    token: 'Bearer lifecycle-token',
    owner: {
      sessionId: 'session-lifecycle-1',
      userId: 'user-lifecycle-1'
    },
    userId: 'user-lifecycle-1',
    username: 'alice'
  });

  let startTaskCalled = false;
  let stopCalls = 0;
  const worker = new ExecutionTaskWorker({
    authStore,
    createApi: () => ({
      createTemplateTask: async () => ({ taskId: 'octo-task-lifecycle-1' }),
      startTask: async () => {
        startTaskCalled = true;
        return { result: StartTaskResult.SUCCESS };
      },
      getTaskStatus: async () => [
        {
          taskId: 'octo-task-lifecycle-1',
          status: 'Executing',
          currentTotalExtractCount: 2
        }
      ],
      stopTask: async () => {
        stopCalls += 1;
      }
    }),
    sleep: async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
  const service = new ExecutionTaskService({
    authStore,
    worker: {
      run: async () => {}
    }
  });

  const workerPromise = worker.run({
    taskId: task.taskId,
    taskStore: requestTaskStore,
    credentialHandleId: 'handle-lifecycle-1',
    credentialOwner: {
      sessionId: 'session-lifecycle-1',
      userId: 'user-lifecycle-1'
    },
    preparedExecution: createPreparedExecution()
  });

  await waitFor(() => {
    assert.equal(startTaskCalled, true);
  });

  await requestTaskStore.updateTaskStatus(
    task.taskId,
    'cancelled',
    'Cancellation requested by the MCP client.'
  );
  await workerPromise;

  await waitFor(async () => {
    const storedTask = await service.getTask(undefined, undefined, {
      taskId: task.taskId,
      taskStore: requestTaskStore
    });
    assert.equal(storedTask.status, 'cancelled');
    assert.equal(storedTask.statusMessage, 'Cancellation requested by the MCP client.');
  });

  const result = await service.getTaskResult(undefined, undefined, {
    taskId: task.taskId,
    taskStore: requestTaskStore
  });

  assert.equal(stopCalls, 1);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.success, false);
  assert.equal(result.structuredContent.status, 'cancelled');
  assert.equal(result.structuredContent.error, 'task_cancelled');
  assert.equal(result.structuredContent.octoparseTask.taskId, 'octo-task-lifecycle-1');
  assert.match(result.content[0].text, /cancelled/i);

  store.cleanup();
});
