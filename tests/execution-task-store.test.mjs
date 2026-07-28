import test from 'node:test';
import assert from 'node:assert/strict';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

test('createTask persists execution metadata and supports status updates', async () => {
  const { InMemoryExecutionTaskStore } = await import('../dist/tasks/execution-task-store.js');

  const store = new InMemoryExecutionTaskStore({
    generateTaskId: () => 'mcp-task-1'
  });

  const task = await store.createTask(
    {
      ttl: 60_000,
      pollInterval: 2_000,
      context: {
        octoparseTaskId: 'octo-task-1',
        targetMaxRows: 500,
        credentialHandleId: 'cred-1'
      }
    },
    'request-1',
    createRequest('request-1'),
    'session-1'
  );

  assert.equal(task.taskId, 'mcp-task-1');
  assert.equal(task.status, 'working');
  assert.equal(task.pollInterval, 2_000);

  const createdRecord = await store.getExecutionTaskRecord('mcp-task-1', 'session-1');

  assert.equal(createdRecord.mcpTaskId, 'mcp-task-1');
  assert.equal(createdRecord.octoparseTaskId, 'octo-task-1');
  assert.equal(createdRecord.targetMaxRows, 500);
  assert.equal(createdRecord.quotaStopRequested, false);
  assert.equal(createdRecord.credentialHandleId, 'cred-1');
  assert.equal(createdRecord.status, 'working');
  assert.equal(createdRecord.statusMessage, undefined);
  assert.equal(createdRecord.finalResult, undefined);

  await store.updateExecutionTaskRecord(
    'mcp-task-1',
    {
      octoparseTaskId: 'octo-task-2',
      quotaStopRequested: true
    },
    'session-1'
  );

  await store.updateTaskStatus('mcp-task-1', 'working', 'Polling upstream task', 'session-1');

  const updatedRecord = await store.getExecutionTaskRecord('mcp-task-1', 'session-1');

  assert.equal(updatedRecord.octoparseTaskId, 'octo-task-2');
  assert.equal(updatedRecord.quotaStopRequested, true);
  assert.equal(updatedRecord.status, 'working');
  assert.equal(updatedRecord.statusMessage, 'Polling upstream task');

  store.cleanup();
});

test('storeTaskResult captures final payload and listTasks returns current task state', async () => {
  const { InMemoryExecutionTaskStore } = await import('../dist/tasks/execution-task-store.js');

  let counter = 0;
  const store = new InMemoryExecutionTaskStore({
    generateTaskId: () => `mcp-task-${++counter}`
  });

  await store.createTask(
    {
      context: {
        credentialHandleId: 'cred-a'
      }
    },
    'request-a',
    createRequest('request-a'),
    'session-a'
  );

  const secondTask = await store.createTask(
    {
      context: {
        octoparseTaskId: 'octo-task-b',
        targetMaxRows: 25,
        credentialHandleId: 'cred-b'
      }
    },
    'request-b',
    createRequest('request-b'),
    'session-a'
  );

  const resultPayload = {
    content: [
      {
        type: 'text',
        text: 'Task finished'
      }
    ],
    structuredContent: {
      rowsCollected: 25,
      completionReason: 'natural_finish'
    }
  };

  await store.storeTaskResult(secondTask.taskId, 'completed', resultPayload, 'session-a');

  const taskResult = await store.getTaskResult(secondTask.taskId, 'session-a');
  const storedRecord = await store.getExecutionTaskRecord(secondTask.taskId, 'session-a');
  const listedTasks = await store.listTasks(undefined, 'session-a');

  assert.deepEqual(taskResult, resultPayload);
  assert.equal(storedRecord.status, 'completed');
  assert.deepEqual(storedRecord.finalResult, resultPayload);
  assert.deepEqual(
    listedTasks.tasks.map((task) => ({
      taskId: task.taskId,
      status: task.status
    })),
    [
      { taskId: 'mcp-task-1', status: 'working' },
      { taskId: 'mcp-task-2', status: 'completed' }
    ]
  );

  store.cleanup();
});

test('updateTaskStatus supports cancellation, allows the final cancellation payload, and still blocks later status writes', async () => {
  const { InMemoryExecutionTaskStore } = await import('../dist/tasks/execution-task-store.js');

  const store = new InMemoryExecutionTaskStore({
    generateTaskId: () => 'mcp-task-cancel'
  });

  await store.createTask(
    {
      context: {
        octoparseTaskId: 'octo-task-cancel',
        credentialHandleId: 'cred-cancel'
      }
    },
    'request-cancel',
    createRequest('request-cancel'),
    'session-cancel'
  );

  await store.updateTaskStatus(
    'mcp-task-cancel',
    'cancelled',
    'Cancelled by caller',
    'session-cancel'
  );

  const cancelledRecord = await store.getExecutionTaskRecord('mcp-task-cancel', 'session-cancel');

  assert.equal(cancelledRecord.status, 'cancelled');
  assert.equal(cancelledRecord.statusMessage, 'Cancelled by caller');

  await assert.rejects(
    () => store.updateTaskStatus('mcp-task-cancel', 'working', undefined, 'session-cancel'),
    /terminal status/i
  );

  await store.storeTaskResult(
    'mcp-task-cancel',
    'failed',
    {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Task cancelled by caller.'
        }
      ],
      structuredContent: {
        success: false,
        status: 'cancelled',
        error: 'task_cancelled'
      }
    },
    'session-cancel'
  );

  const cancelledResult = await store.getTaskResult('mcp-task-cancel', 'session-cancel');
  const cancelledTask = await store.getTask('mcp-task-cancel', 'session-cancel');

  assert.equal(cancelledTask.status, 'cancelled');
  assert.equal(cancelledResult.structuredContent.status, 'cancelled');

  await assert.rejects(
    () => store.updateTaskStatus('mcp-task-cancel', 'failed', 'nope', 'session-cancel'),
    /terminal status/i
  );

  store.cleanup();
});

test('storeTaskResult preserves failed statusMessage when a terminal failure payload is stored after a failed status update', async () => {
  const { InMemoryExecutionTaskStore } = await import('../dist/tasks/execution-task-store.js');

  const store = new InMemoryExecutionTaskStore({
    generateTaskId: () => 'mcp-task-failed-status'
  });

  await store.createTask(
    {
      context: {
        octoparseTaskId: 'octo-task-failed-status',
        credentialHandleId: 'cred-failed-status'
      }
    },
    'request-failed-status',
    createRequest('request-failed-status'),
    'session-failed-status'
  );

  await store.updateTaskStatus(
    'mcp-task-failed-status',
    'failed',
    'Template creation failed: upstream rejected the parameters.',
    'session-failed-status'
  );

  await store.storeTaskResult(
    'mcp-task-failed-status',
    'failed',
    {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Template creation failed: upstream rejected the parameters.'
        }
      ],
      structuredContent: {
        success: false,
        status: 'failed',
        error: 'task_creation_failed'
      }
    },
    'session-failed-status'
  );

  const failedTask = await store.getTask('mcp-task-failed-status', 'session-failed-status');
  const failedResult = await store.getTaskResult('mcp-task-failed-status', 'session-failed-status');

  assert.equal(failedTask.status, 'failed');
  assert.equal(
    failedTask.statusMessage,
    'Template creation failed: upstream rejected the parameters.'
  );
  assert.equal(failedResult.structuredContent.error, 'task_creation_failed');

  store.cleanup();
});

test('session-bound tasks reject cross-session access and are excluded from other session listings', async () => {
  const { InMemoryExecutionTaskStore } = await import('../dist/tasks/execution-task-store.js');

  let counter = 0;
  const store = new InMemoryExecutionTaskStore({
    generateTaskId: () => `mcp-task-session-${++counter}`
  });

  const ownerTask = await store.createTask(
    {
      context: {
        octoparseTaskId: 'octo-owner',
        credentialHandleId: 'cred-owner'
      }
    },
    'request-owner',
    createRequest('request-owner'),
    'session-owner'
  );

  await store.createTask(
    {
      context: {
        octoparseTaskId: 'octo-other',
        credentialHandleId: 'cred-other'
      }
    },
    'request-other',
    createRequest('request-other'),
    'session-other'
  );

  const ownerVisibleTasks = await store.listTasks(undefined, 'session-owner');
  const otherVisibleTasks = await store.listTasks(undefined, 'session-other');
  const unboundVisibleTasks = await store.listTasks(undefined);

  assert.deepEqual(
    ownerVisibleTasks.tasks.map((task) => task.taskId),
    [ownerTask.taskId]
  );
  assert.deepEqual(
    otherVisibleTasks.tasks.map((task) => task.taskId),
    ['mcp-task-session-2']
  );
  assert.deepEqual(unboundVisibleTasks.tasks, []);

  assert.equal(await store.getTask(ownerTask.taskId, 'session-other'), null);

  await assert.rejects(
    () => store.getExecutionTaskRecord(ownerTask.taskId, 'session-other'),
    /session/i
  );

  await assert.rejects(
    () =>
      store.updateExecutionTaskRecord(
        ownerTask.taskId,
        {
          quotaStopRequested: true
        },
        'session-other'
      ),
    /session/i
  );

  await assert.rejects(
    () => store.updateTaskStatus(ownerTask.taskId, 'cancelled', 'nope', 'session-other'),
    /session/i
  );

  const ownerRecord = await store.getExecutionTaskRecord(ownerTask.taskId, 'session-owner');
  assert.equal(ownerRecord.quotaStopRequested, false);
  assert.equal(ownerRecord.status, 'working');

  store.cleanup();
});

test('ttl zero expires a task on the next tick instead of retaining it indefinitely', async () => {
  const { InMemoryExecutionTaskStore } = await import('../dist/tasks/execution-task-store.js');

  const store = new InMemoryExecutionTaskStore({
    generateTaskId: () => 'mcp-task-ttl-zero'
  });

  await store.createTask(
    {
      ttl: 0,
      context: {
        octoparseTaskId: 'octo-ttl-zero',
        credentialHandleId: 'cred-ttl-zero'
      }
    },
    'request-ttl-zero',
    createRequest('request-ttl-zero'),
    'session-ttl-zero'
  );

  await delay(0);

  assert.equal(await store.getTask('mcp-task-ttl-zero', 'session-ttl-zero'), null);
  await assert.rejects(
    () => store.getExecutionTaskRecord('mcp-task-ttl-zero', 'session-ttl-zero'),
    /not found/i
  );

  const listedTasks = await store.listTasks(undefined, 'session-ttl-zero');
  assert.deepEqual(listedTasks.tasks, []);

  store.cleanup();
});
