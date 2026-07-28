import test from 'node:test';
import assert from 'node:assert/strict';

import { z } from 'zod';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';
process.env.LOG_ENABLE_CONSOLE = 'false';
process.env.LOG_ENABLE_FILE = 'false';

const { executeToolDirect } = await import('../dist/tools.js');
const { executeToolWithMiddleware, registerToolTask } = await import('../dist/tools/tool-registry.js');
const { Logger } = await import('../dist/utils/logger.js');
const { RequestContextManager } = await import('../dist/utils/request-context.js');

test('executeToolDirect writes toolInput and toolOutput to request context without tool logger output', async () => {
  const originalInfo = Logger.info;
  const infoCalls = [];

  Logger.info = (message, options) => {
    infoCalls.push({ message, options });
  };

  try {
    let context;
    const result = await RequestContextManager.runWithContext(
      {
        requestId: 'req-direct',
        correlationId: 'corr-direct',
        startTime: Date.now()
      },
      () => executeToolDirect(
        {
          name: 'export_data',
          title: 'Export data',
          description: 'Logs through request context',
          requiresAuth: false,
          inputSchema: z.object({ taskId: z.string() }),
          handler: async ({ taskId }) => ({
            success: true,
            taskId,
            status: 'exported',
            lot: 'lot-direct',
            dataTotal: 1,
            latestExportFileStatusLabel: 'Generated',
            message: 'done'
          })
        },
        {
          taskId: 'task-direct'
        }
      ).finally(() => {
        context = RequestContextManager.getContext();
      })
    );

    assert.equal(result.isError, undefined);
    assert.deepEqual(context?.toolInput, { taskId: 'task-direct' });
    assert.deepEqual(context?.toolOutput, {
      taskId: 'task-direct',
      status: 'exported',
      lot: 'lot-direct',
      dataTotal: 1,
      latestExportFileStatusLabel: 'Generated',
      message: 'done'
    });
    assert.equal(
      infoCalls.some((entry) => entry.options?.loggerName === 'octoparse.mcp.tool'),
      false
    );
  } finally {
    Logger.info = originalInfo;
  }
});

test('executeToolWithMiddleware logs parsed toolInput and projected search_templates toolOutput', async () => {
  const events = [];
  const tool = {
    name: 'search_templates',
    title: 'Search templates',
    description: 'Searches templates',
    requiresAuth: false,
    inputSchema: z.object({
      keyword: z.string().optional(),
      limit: z.number().optional().default(10),
      empty: z.string().optional()
    }),
    handler: async () => ({
      success: true,
      templates: [
        { templateId: 101, templateName: 'first' },
        { templateId: 202, templateName: 'second' }
      ]
    })
  };

  await executeToolWithMiddleware(
    tool,
    async () => undefined,
    {
      keyword: 'amazon',
      empty: ''
    },
    {
      logSink: {
        start: async (_tool, meta) => events.push({ event: 'start', meta }),
        success: async (_tool, meta) => events.push({ event: 'success', meta }),
        authRejected: async (_tool, meta) => events.push({ event: 'authRejected', meta }),
        failure: async (_tool, _error, meta) => events.push({ event: 'failure', meta })
      }
    }
  );

  assert.deepEqual(events.find((entry) => entry.event === 'start')?.meta?.toolInput, {
    keyword: 'amazon',
    limit: 10
  });
  assert.deepEqual(events.find((entry) => entry.event === 'success')?.meta?.toolOutput, {
    templateIds: '101,202'
  });
});

test('executeToolWithMiddleware logs configured output projections by tool name', async () => {
  const cases = [
    {
      toolName: 'execute_task',
      result: {
        success: true,
        taskId: 'task-1',
        lotNo: 'lot-1',
        message: 'accepted',
        ignored: 'nope'
      },
      expectedOutput: {
        taskId: 'task-1',
        lotNo: 'lot-1',
        message: 'accepted'
      }
    },
    {
      toolName: 'export_data',
      result: {
        success: true,
        taskId: 'task-2',
        status: 'exported',
        lot: 'lot-2',
        dataTotal: 12,
        latestExportFileStatusLabel: 'Generated',
        message: 'done',
        sampleData: [{ a: 1 }]
      },
      expectedOutput: {
        taskId: 'task-2',
        status: 'exported',
        lot: 'lot-2',
        dataTotal: 12,
        latestExportFileStatusLabel: 'Generated',
        message: 'done'
      }
    },
    {
      toolName: 'start_or_stop_task',
      result: {
        success: true,
        taskId: 'task-3',
        previousStatus: 'Stopped',
        status: 'start_requested',
        lot: 'lot-3',
        message: 'Start request accepted.',
        action: 'start'
      },
      expectedOutput: {
        taskId: 'task-3',
        previousStatus: 'Stopped',
        status: 'start_requested',
        lot: 'lot-3',
        message: 'Start request accepted.'
      }
    }
  ];

  for (const item of cases) {
    const events = [];

    await executeToolWithMiddleware(
      {
        name: item.toolName,
        title: item.toolName,
        description: item.toolName,
        requiresAuth: false,
        inputSchema: z.object({ taskId: z.string() }),
        handler: async () => item.result
      },
      async () => undefined,
      {
        taskId: item.result.taskId
      },
      {
        logSink: {
          start: async (_tool, meta) => events.push({ event: 'start', meta }),
          success: async (_tool, meta) => events.push({ event: 'success', meta }),
          authRejected: async (_tool, meta) => events.push({ event: 'authRejected', meta }),
          failure: async (_tool, _error, meta) => events.push({ event: 'failure', meta })
        }
      }
    );

    assert.deepEqual(events.find((entry) => entry.event === 'success')?.meta?.toolOutput, item.expectedOutput);
  }
});

test('registerToolTask writes parsed task inputs and projected task result output to request context', async () => {
  let taskHandlers;
  const server = {
    experimental: {
      tasks: {
        registerToolTask: (_name, _config, handlers) => {
          taskHandlers = handlers;
        }
      }
    },
    server: {
      sendLoggingMessage: async () => {}
    }
  };

  registerToolTask(
    server,
    {
      name: 'execute_task',
      title: 'Execute task',
      description: 'Executes task',
      requiresAuth: false,
      inputSchema: z.object({
        templateName: z.string(),
        targetMaxRows: z.number().optional()
      }),
      handler: async () => ({}),
      taskRegistration: {
        execution: {
          taskSupport: 'optional'
        },
        handler: {
          createTask: async () => ({ task: { taskId: 'mcp-task-1', status: 'completed' } }),
          getTask: async () => ({ task: { taskId: 'mcp-task-1', status: 'completed' } }),
          getTaskResult: async () => ({
            content: [{ type: 'text', text: 'done' }],
            structuredContent: {
              success: true,
              taskId: 'octo-task-1',
              lotNo: 'lot-task-1',
              message: 'done',
              ignored: true
            }
          })
        }
      }
    },
    async () => undefined
  );

  let context;
  await RequestContextManager.runWithContext(
    {
      requestId: 'req-task',
      correlationId: 'corr-task',
      startTime: Date.now()
    },
    () => taskHandlers.getTaskResult(
      {
        templateName: 'amazon',
        targetMaxRows: 100
      },
      {}
    ).finally(() => {
      context = RequestContextManager.getContext();
    })
  );

  assert.deepEqual(context?.toolInput, {
    templateName: 'amazon',
    targetMaxRows: 100
  });
  assert.deepEqual(context?.toolOutput, {
    taskId: 'octo-task-1',
    lotNo: 'lot-task-1',
    message: 'done'
  });
});

test('executeToolDirect records failed parsed input in request context without tool logger output', async () => {
  const originalLogError = Logger.logError;
  const originalError = Logger.error;
  const originalInfo = Logger.info;
  const logErrorCalls = [];
  const errorCalls = [];

  Logger.logError = (message, error, options) => {
    logErrorCalls.push({ message, error, options });
  };
  Logger.error = (message, options) => {
    errorCalls.push({ message, options });
  };
  Logger.info = () => {};

  try {
    let context;
    const result = await RequestContextManager.runWithContext(
      {
        requestId: 'req-failure',
        correlationId: 'corr-failure',
        startTime: Date.now()
      },
      () => executeToolDirect(
        {
          name: 'direct_logging_failure_tool',
          title: 'Direct logging failure tool',
          description: 'Fails through the direct execution path',
          requiresAuth: false,
          inputSchema: z.object({ value: z.string() }),
          handler: async () => {
            throw new Error('simulated direct failure');
          }
        },
        { value: 'bad' }
      ).finally(() => {
        context = RequestContextManager.getContext();
      })
    );

    assert.equal(result.isError, true);
    assert.deepEqual(context?.toolInput, { value: 'bad' });
    assert.equal(logErrorCalls.length, 0);
    assert.equal(
      errorCalls.some((entry) => entry.options?.loggerName === 'octoparse.mcp.tool'),
      false
    );
  } finally {
    Logger.logError = originalLogError;
    Logger.error = originalError;
    Logger.info = originalInfo;
  }
});

test('executeToolWithMiddleware works without an explicit log sink', async () => {
  const result = await executeToolWithMiddleware(
    {
      name: 'no_sink_tool',
      title: 'No sink tool',
      description: 'Executes without explicit logging configuration',
      requiresAuth: false,
      inputSchema: z.object({ value: z.string() }),
      handler: async ({ value }) => ({
        echoed: value
      })
    },
    async () => undefined,
    {
      value: 'hello'
    }
  );

  assert.equal(result.isError, undefined);
  assert.equal(String(result.content[0].text).includes('"echoed": "hello"'), true);
});
