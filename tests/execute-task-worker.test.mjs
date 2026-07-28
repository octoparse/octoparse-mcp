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
const { RequestContextManager } = await import('../dist/utils/request-context.js');
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

test('ExecutionTaskService returns task metadata immediately and starts background execution with a credential handle', async () => {
  const store = new InMemoryExecutionTaskStore({
    generateTaskId: () => 'mcp-task-service-1'
  });
  const authStore = new InMemoryExecutionTaskAuthStore({
    generateHandleId: () => 'handle-service-1'
  });
  const request = createRequest('request-service-1', {
    templateName: 'amazon-cloud',
    parameters: {
      keyword: ['iphone']
    }
  });
  const requestTaskStore = createRequestTaskStore(
    store,
    'request-service-1',
    request,
    'session-service-1'
  );

  let releaseWorker;
  const workerCalls = [];
  const worker = {
    run: async (job) => {
      workerCalls.push(job);
      await new Promise((resolve) => {
        releaseWorker = resolve;
      });
      await job.taskStore.storeTaskResult(job.taskId, 'completed', {
        content: [
          {
            type: 'text',
            text: 'Background execution finished.'
          }
        ],
        structuredContent: {
          ok: true
        }
      });
    }
  };

  const service = new ExecutionTaskService({
    authStore,
    worker,
    credentialHandleTtlMs: 60_000
  });

  const createTaskResult = await RequestContextManager.runWithContext(
    {
      requestId: 'request-service-1',
      correlationId: 'corr-service-1',
      sessionId: 'session-service-1',
      userId: 'user-service-1',
      username: 'alice',
      token: 'Bearer raw-token',
      startTime: Date.now()
    },
    () =>
      service.createTask({
        preparedExecution: createPreparedExecution({
          targetMaxRows: 25
        }),
        extra: {
          requestId: 'request-service-1',
          sessionId: 'session-service-1',
          taskStore: requestTaskStore,
          signal: AbortSignal.timeout(1_000),
          sendNotification: async () => {},
          sendRequest: async () => ({})
        }
      })
  );

  assert.equal(createTaskResult.task.taskId, 'mcp-task-service-1');
  assert.equal(createTaskResult.task.status, 'working');

  await waitFor(() => {
    assert.equal(workerCalls.length, 1);
  });

  const pendingTask = await requestTaskStore.getTask('mcp-task-service-1');
  assert.equal(pendingTask.status, 'working');
  assert.equal(workerCalls[0].credentialHandleId, 'handle-service-1');
  assert.deepEqual(workerCalls[0].credentialOwner, {
    sessionId: 'session-service-1',
    userId: 'user-service-1'
  });

  releaseWorker();

  await waitFor(async () => {
    const task = await requestTaskStore.getTask('mcp-task-service-1');
    assert.equal(task.status, 'completed');
  });

  const finalResult = await requestTaskStore.getTaskResult('mcp-task-service-1');
  assert.equal(finalResult.structuredContent.ok, true);

  store.cleanup();
});

test('ExecutionTaskWorker stops after targetMaxRows best-effort and stores a final export recommendation payload', async () => {
  const store = new InMemoryExecutionTaskStore({
    generateTaskId: () => 'mcp-task-worker-success'
  });
  const authStore = new InMemoryExecutionTaskAuthStore({
    generateHandleId: () => 'handle-worker-success'
  });
  const request = createRequest('request-worker-success', {
    templateName: 'amazon-cloud',
    parameters: {
      keyword: ['iphone']
    },
    targetMaxRows: 4
  });
  const requestTaskStore = createRequestTaskStore(
    store,
    'request-worker-success',
    request,
    'session-worker-success'
  );
  const task = await requestTaskStore.createTask({
    ttl: 60_000
  });

  authStore.createHandle({
    token: 'Bearer worker-token',
    owner: {
      sessionId: 'session-worker-success',
      userId: 'user-worker-success'
    },
    userId: 'user-worker-success',
    username: 'worker'
  });

  const statusSnapshots = [
    [
      {
        taskId: 'octo-task-1',
        status: 'Executing',
        currentTotalExtractCount: 2
      }
    ],
    [
      {
        taskId: 'octo-task-1',
        status: 'Executing',
        currentTotalExtractCount: 5
      }
    ],
    [
      {
        taskId: 'octo-task-1',
        status: 'Stopped',
        currentTotalExtractCount: 5
      }
    ]
  ];

  let stopCalls = 0;
  const createTemplateTaskCalls = [];

  const worker = new ExecutionTaskWorker({
    authStore,
    createApi: () => ({
      createTemplateTask: async (...args) => {
        createTemplateTaskCalls.push(args);
        return { taskId: 'octo-task-1' };
      },
      startTask: async () => ({
        result: StartTaskResult.SUCCESS
      }),
      getTaskStatus: async () => statusSnapshots.shift() ?? [],
      stopTask: async () => {
        stopCalls += 1;
      }
    }),
    sleep: async () => {}
  });

  await worker.run({
    taskId: task.taskId,
    taskStore: requestTaskStore,
    credentialHandleId: 'handle-worker-success',
    credentialOwner: {
      sessionId: 'session-worker-success',
      userId: 'user-worker-success'
    },
    preparedExecution: createPreparedExecution({
      targetMaxRows: 4
    })
  });

  assert.equal(createTemplateTaskCalls.length, 1);
  assert.equal(stopCalls, 1);

  const finalTask = await requestTaskStore.getTask(task.taskId);
  const finalResult = await requestTaskStore.getTaskResult(task.taskId);

  assert.equal(finalTask.status, 'completed');
  assert.equal(finalResult.structuredContent.success, true);
  assert.equal(finalResult.structuredContent.status, 'completed');
  assert.equal(finalResult.structuredContent.preferredExecutionMode, 'task');
  assert.equal(finalResult.structuredContent.actualExecutionMode, 'task');
  assert.equal(finalResult.structuredContent.followupProtocol, 'tasks/get -> tasks/result -> export_data');
  assert.equal(finalResult.structuredContent.completionReason, 'quota_stop');
  assert.equal(finalResult.structuredContent.octoparseTask.taskId, 'octo-task-1');
  assert.equal(finalResult.structuredContent.nextStep.tool, 'export_data');
  assert.equal(finalResult.structuredContent.nextStep.args.taskId, 'octo-task-1');
  assert.match(finalResult.content[0].text, /best-effort/i);

  store.cleanup();
});

test('ExecutionTaskWorker stores a failed MCP result when startTask throws', async () => {
  const store = new InMemoryExecutionTaskStore({
    generateTaskId: () => 'mcp-task-worker-failed'
  });
  const authStore = new InMemoryExecutionTaskAuthStore({
    generateHandleId: () => 'handle-worker-failed'
  });
  const requestTaskStore = createRequestTaskStore(
    store,
    'request-worker-failed',
    createRequest('request-worker-failed'),
    'session-worker-failed'
  );
  const task = await requestTaskStore.createTask({
    ttl: 60_000
  });

  authStore.createHandle({
    apiKey: 'raw-api-key',
    owner: {
      sessionId: 'session-worker-failed',
      userId: 'user-worker-failed'
    },
    userId: 'user-worker-failed',
    username: 'worker'
  });

  const worker = new ExecutionTaskWorker({
    authStore,
    createApi: () => ({
      createTemplateTask: async () => ({ taskId: 'octo-task-failed' }),
      startTask: async () => {
        throw new Error('Upstream cloud start rejected');
      }
    }),
    sleep: async () => {}
  });

  await worker.run({
    taskId: task.taskId,
    taskStore: requestTaskStore,
    credentialHandleId: 'handle-worker-failed',
    credentialOwner: {
      sessionId: 'session-worker-failed',
      userId: 'user-worker-failed'
    },
    preparedExecution: createPreparedExecution()
  });

  const finalTask = await requestTaskStore.getTask(task.taskId);
  const finalResult = await requestTaskStore.getTaskResult(task.taskId);

  assert.equal(finalTask.status, 'failed');
  assert.equal(finalTask.statusMessage, 'Cloud start failed: Upstream cloud start rejected.');
  assert.equal(finalResult.isError, true);
  assert.equal(finalResult.structuredContent.success, false);
  assert.equal(finalResult.structuredContent.error, 'cloud_start_failed');
  assert.equal(finalResult.structuredContent.preferredExecutionMode, 'task');
  assert.equal(finalResult.structuredContent.actualExecutionMode, 'task');
  assert.equal(finalResult.structuredContent.followupProtocol, 'tasks/get -> tasks/result -> export_data');
  assert.equal(finalResult.structuredContent.octoparseTask.taskId, 'octo-task-failed');
  assert.match(finalResult.content[0].text, /cloud start/i);

  store.cleanup();
});
