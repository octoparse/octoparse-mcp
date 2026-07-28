import test from 'node:test';
import assert from 'node:assert/strict';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CreateTaskResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';

const { createMcpServer } = await import('../dist/server.js');
const { AppConfig } = await import('../dist/config/app-config.js');

async function connectClientAndServer(server) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({
    name: 'task-capability-test-client',
    version: '1.0.0'
  });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    }
  };
}

function createSharedTaskTool(name = 'shared_task_creator') {
  return {
    name,
    title: 'Shared task creator',
    description: 'Creates a task in the principal-scoped shared task store',
    requiresAuth: false,
    inputSchema: z.object({}),
    handler: async () => ({ ok: true }),
    taskRegistration: {
      execution: { taskSupport: 'required' },
      handler: {
        createTask: async (_args, _getApi, extra) => {
          const task = await extra.taskStore.createTask({ ttl: 60_000 });
          return { task };
        },
        getTask: async (_args, _getApi, extra) => ({
          task: await extra.taskStore.getTask(extra.taskId)
        }),
        getTaskResult: async (_args, _getApi, extra) =>
          await extra.taskStore.getTaskResult(extra.taskId)
      }
    }
  };
}

test('createMcpServer advertises MCP tasks capability during initialize', async () => {
  const server = createMcpServer(undefined, undefined, undefined, []);
  const { client, close } = await connectClientAndServer(server);

  try {
    const capabilities = client.getServerCapabilities();
    assert.deepEqual(capabilities.tasks, {
      list: {},
      cancel: {},
      requests: {
        tools: {
          call: {}
        }
      }
    });
  } finally {
    await close();
  }
});

test('createMcpServer wires a task store for MCP task operations', async () => {
  const server = createMcpServer(undefined, undefined, undefined, []);

  const { client, close } = await connectClientAndServer(server);

  try {
    const listed = await client.experimental.tasks.listTasks();
    assert.deepEqual(listed, {
      tasks: [],
      nextCursor: undefined,
      _meta: {}
    });
  } finally {
    await close();
  }
});

test('createMcpServer uses configured task defaults for advertised capability and created task poll interval', async () => {
  const previousEnabled = process.env.MCP_TASKS_ENABLED;
  const previousPollInterval = process.env.EXECUTION_TASK_POLL_INTERVAL_MS;

  process.env.MCP_TASKS_ENABLED = 'true';
  process.env.EXECUTION_TASK_POLL_INTERVAL_MS = '4321';
  AppConfig.reset();

  const server = createMcpServer(undefined, undefined, undefined, [
    createSharedTaskTool('configured_task_creator')
  ]);
  const { client, close } = await connectClientAndServer(server);

  try {
    const capabilities = client.getServerCapabilities();
    assert.deepEqual(capabilities.tasks, {
      list: {},
      cancel: {},
      requests: {
        tools: {
          call: {}
        }
      }
    });

    const created = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'configured_task_creator',
          arguments: {}
        }
      },
      CreateTaskResultSchema,
      {
        task: { ttl: 60_000 }
      }
    );

    assert.equal(created.task.pollInterval, 4321);
  } finally {
    if (previousEnabled === undefined) {
      delete process.env.MCP_TASKS_ENABLED;
    } else {
      process.env.MCP_TASKS_ENABLED = previousEnabled;
    }
    if (previousPollInterval === undefined) {
      delete process.env.EXECUTION_TASK_POLL_INTERVAL_MS;
    } else {
      process.env.EXECUTION_TASK_POLL_INTERVAL_MS = previousPollInterval;
    }
    AppConfig.reset();
    await close();
  }
});

test('task-aware tools rely on MCP SDK input validation before createTask runs', async () => {
  let createTaskCalls = 0;
  const server = createMcpServer(undefined, undefined, undefined, [
    {
      name: 'validated_task_tool',
      title: 'Validated task tool',
      description: 'Uses SDK task input validation',
      requiresAuth: false,
      inputSchema: z.object({
        value: z.string()
      }),
      handler: async () => ({ ok: true }),
      taskRegistration: {
        execution: { taskSupport: 'required' },
        handler: {
          createTask: async (_args, _getApi, extra) => {
            createTaskCalls += 1;
            const task = await extra.taskStore.createTask({ ttl: 60_000 });
            return { task };
          },
          getTask: async (_args, _getApi, extra) => ({
            task: await extra.taskStore.getTask(extra.taskId)
          }),
          getTaskResult: async (_args, _getApi, extra) =>
            await extra.taskStore.getTaskResult(extra.taskId)
        }
      }
    }
  ]);

  const { client, close } = await connectClientAndServer(server);

  try {
    await assert.rejects(
      client.request(
        {
          method: 'tools/call',
          params: {
            name: 'validated_task_tool',
            arguments: {}
          }
        },
        CreateTaskResultSchema,
        {
          task: { ttl: 60_000 }
        }
      )
    );

    assert.equal(createTaskCalls, 0);
  } finally {
    await close();
  }
});

test('repeated createMcpServer calls reuse task state for the same principal', async () => {
  const principal = { id: 'principal-a', username: 'alice' };
  const firstServer = createMcpServer(principal, undefined, undefined, [
    createSharedTaskTool()
  ]);

  const firstConnection = await connectClientAndServer(firstServer);
  let createdTaskId;

  try {
    const created = await firstConnection.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'shared_task_creator',
          arguments: {}
        }
      },
      CreateTaskResultSchema,
      {
        task: { ttl: 60_000 }
      }
    );

    createdTaskId = created.task.taskId;
  } finally {
    await firstConnection.close();
  }

  const secondServer = createMcpServer(principal, undefined, undefined, []);
  const secondConnection = await connectClientAndServer(secondServer);

  try {
    const listed = await secondConnection.client.experimental.tasks.listTasks();
    assert.equal(listed.tasks.some((task) => task.taskId === createdTaskId), true);
  } finally {
    await secondConnection.close();
  }
});

test('different principals do not share task state across repeated createMcpServer calls', async () => {
  const ownerPrincipal = { id: 'principal-owner', username: 'owner' };
  const otherPrincipal = { id: 'principal-other', username: 'other' };
  const ownerServer = createMcpServer(ownerPrincipal, undefined, undefined, [
    createSharedTaskTool('isolated_task_creator')
  ]);

  const ownerConnection = await connectClientAndServer(ownerServer);
  let createdTaskId;

  try {
    const created = await ownerConnection.client.request(
      {
        method: 'tools/call',
        params: {
          name: 'isolated_task_creator',
          arguments: {}
        }
      },
      CreateTaskResultSchema,
      {
        task: { ttl: 60_000 }
      }
    );

    createdTaskId = created.task.taskId;
  } finally {
    await ownerConnection.close();
  }

  const otherServer = createMcpServer(otherPrincipal, undefined, undefined, []);
  const otherConnection = await connectClientAndServer(otherServer);

  try {
    const listed = await otherConnection.client.experimental.tasks.listTasks();
    assert.equal(listed.tasks.some((task) => task.taskId === createdTaskId), false);
  } finally {
    await otherConnection.close();
  }
});
