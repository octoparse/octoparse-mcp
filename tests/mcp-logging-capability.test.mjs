import test from 'node:test';
import assert from 'node:assert/strict';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';

const { createMcpServer } = await import('../dist/server.js');
const { registerTool } = await import('../dist/tools/tool-registry.js');
const { RequestContextManager } = await import('../dist/utils/request-context.js');

async function connectClientAndServer(server) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({
    name: 'logging-test-client',
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

test('createMcpServer advertises MCP logging capability during initialize', async () => {
  const server = createMcpServer(undefined, undefined, undefined, []);
  const { client, close } = await connectClientAndServer(server);

  try {
    const capabilities = client.getServerCapabilities();
    assert.ok(capabilities.logging);
  } finally {
    await close();
  }
});

test('tool execution no longer emits octoparse.mcp.tool MCP logs', async () => {
  const server = createMcpServer(undefined, undefined, undefined, []);
  registerTool(
    server,
    {
      name: 'demo_logging_tool',
      title: 'Demo logging tool',
      description: 'Returns a demo payload',
      requiresAuth: false,
      inputSchema: z.object({}),
      handler: async () => ({ ok: true })
    },
    async () => undefined
  );

  const notifications = [];
  const originalSendLoggingMessage = server.server.sendLoggingMessage.bind(server.server);
  server.server.sendLoggingMessage = async (params) => {
    notifications.push(params);
    return originalSendLoggingMessage(params);
  };
  const { client, close } = await connectClientAndServer(server);

  try {
    await client.setLoggingLevel('debug');
    await client.callTool({
      name: 'demo_logging_tool',
      arguments: {}
    });

    assert.equal(notifications.some((entry) => entry.logger === 'octoparse.mcp.tool'), false);
  } finally {
    server.server.sendLoggingMessage = originalSendLoggingMessage;
    await close();
  }
});

test('registered tool execution writes toolInput and toolOutput to request context for HTTP logging', async () => {
  const server = createMcpServer(undefined, undefined, undefined, []);
  registerTool(
    server,
    {
      name: 'export_data',
      title: 'Export data',
      description: 'Returns export status',
      requiresAuth: false,
      inputSchema: z.object({
        taskId: z.string(),
        previewRows: z.number().optional()
      }),
      handler: async () => ({
        success: true,
        taskId: 'task-log-1',
        status: 'exported',
        lot: 'lot-log-1',
        dataTotal: 3,
        latestExportFileStatusLabel: 'Generated',
        message: 'Export completed successfully.',
        sampleData: [{ value: 'not logged' }]
      })
    },
    async () => undefined
  );

  const { client, close } = await connectClientAndServer(server);
  let context;

  try {
    await RequestContextManager.runWithContext(
      {
        requestId: 'req-http',
        correlationId: 'corr-http',
        startTime: Date.now()
      },
      async () => {
        await client.callTool({
          name: 'export_data',
          arguments: {
            taskId: 'task-log-1',
            previewRows: 5
          }
        });
        context = RequestContextManager.getContext();
      }
    );

    assert.deepEqual(context?.toolInput, {
      taskId: 'task-log-1',
      previewRows: 5
    });
    assert.deepEqual(context?.toolOutput, {
      taskId: 'task-log-1',
      status: 'exported',
      lot: 'lot-log-1',
      dataTotal: 3,
      latestExportFileStatusLabel: 'Generated',
      message: 'Export completed successfully.'
    });
  } finally {
    await close();
  }
});

test('warning log level no longer receives octoparse.mcp.tool error logs', async () => {
  const server = createMcpServer(undefined, undefined, undefined, []);
  registerTool(
    server,
    {
      name: 'failing_logging_tool',
      title: 'Failing logging tool',
      description: 'Throws a demo error',
      requiresAuth: false,
      inputSchema: z.object({}),
      handler: async () => {
        throw new Error('simulated failure');
      }
    },
    async () => undefined
  );

  const notifications = [];
  const originalSendLoggingMessage = server.server.sendLoggingMessage.bind(server.server);
  server.server.sendLoggingMessage = async (params) => {
    notifications.push(params);
    return originalSendLoggingMessage(params);
  };
  const { client, close } = await connectClientAndServer(server);
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    await client.setLoggingLevel('warning');
    const result = await client.callTool({
      name: 'failing_logging_tool',
      arguments: {}
    });

    assert.equal(result.isError, true);
    assert.equal(notifications.some((entry) => entry.logger === 'octoparse.mcp.tool'), false);
  } finally {
    console.error = originalConsoleError;
    server.server.sendLoggingMessage = originalSendLoggingMessage;
    await close();
  }
});
