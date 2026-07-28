import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';

const { InMemoryExecutionTaskStore } = await import('../dist/tasks/execution-task-store.js');
const { InMemoryExecutionTaskAuthStore } = await import('../dist/tasks/execution-task-auth.js');
const { ExecutionTaskWorker } = await import('../dist/tasks/execution-task-worker.js');

function createRequest(id) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name: 'execute_task',
      arguments: {
        templateName: 'amazon-cloud'
      }
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

function createPreparedExecution() {
  return {
    templateId: 42,
    templateName: 'amazon-cloud',
    taskName: 'Amazon Recovery Run',
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
    ignoredParameterKeys: []
  };
}

test('ExecutionTaskWorker degrades to input_required when the credential handle has expired before background execution starts', async () => {
  const store = new InMemoryExecutionTaskStore({
    generateTaskId: () => 'mcp-task-recovery-1'
  });
  const authStore = new InMemoryExecutionTaskAuthStore({
    generateHandleId: () => 'handle-recovery-1'
  });
  const requestTaskStore = createRequestTaskStore(
    store,
    'request-recovery-1',
    createRequest('request-recovery-1'),
    'session-recovery-1'
  );

  const task = await requestTaskStore.createTask({
    ttl: 60_000
  });

  authStore.createHandle({
    token: 'Bearer expiring-token',
    owner: {
      sessionId: 'session-recovery-1',
      userId: 'user-recovery-1'
    },
    userId: 'user-recovery-1',
    username: 'alice',
    ttlMs: 1
  });

  await new Promise((resolve) => setTimeout(resolve, 5));

  const worker = new ExecutionTaskWorker({
    authStore,
    createApi: () => {
      throw new Error('createApi should not be called when credentials are unavailable');
    },
    sleep: async () => {}
  });

  await worker.run({
    taskId: task.taskId,
    taskStore: requestTaskStore,
    credentialHandleId: 'handle-recovery-1',
    credentialOwner: {
      sessionId: 'session-recovery-1',
      userId: 'user-recovery-1'
    },
    preparedExecution: createPreparedExecution()
  });

  const recoveredTask = await requestTaskStore.getTask(task.taskId);
  const recoveredResult = await requestTaskStore.getTaskResult(task.taskId);

  assert.equal(recoveredTask.status, 'input_required');
  assert.match(recoveredTask.statusMessage, /credential/i);
  assert.equal(recoveredResult.isError, true);
  assert.equal(recoveredResult.structuredContent.status, 'input_required');
  assert.ok(
    ['credential_handle_expired', 'credential_handle_not_found'].includes(
      recoveredResult.structuredContent.error
    )
  );
  assert.match(recoveredResult.content[0].text, /re-authenticate|authenticate/i);

  store.cleanup();
});
