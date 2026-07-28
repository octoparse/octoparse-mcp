import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';

const { registerAllTools } = await import('../dist/tools.js');
const { allTools } = await import('../dist/tools/tool-definitions.js');

function baseZodTypeName(schema) {
  let current = schema;
  while (current?._def) {
    const typeName = current._def.typeName;
    if (typeName === 'ZodDefault' || typeName === 'ZodOptional' || typeName === 'ZodNullable') {
      current = current._def.innerType;
      continue;
    }
    if (typeName === 'ZodEffects') {
      current = current._def.schema;
      continue;
    }
    return typeName;
  }
  return undefined;
}

test('registerAllTools registers only the provided tool subset', () => {
  const registered = [];
  const fakeServer = {
    registerTool(name, meta, handler) {
      registered.push({ name, meta, handler });
    }
  };

  const selected = allTools.filter((tool) =>
    ['search_templates', 'export_data'].includes(tool.name)
  );

  registerAllTools(fakeServer, undefined, undefined, undefined, selected);

  assert.deepEqual(
    registered.map((entry) => entry.name),
    ['search_templates', 'export_data']
  );
  assert.equal(typeof registered[0].handler, 'function');
});

test('registerAllTools uses task registration only for task-aware tools', () => {
  const registeredTools = [];
  const registeredToolTasks = [];
  const fakeServer = {
    registerTool(name, meta, handler) {
      registeredTools.push({ name, meta, handler });
    },
    experimental: {
      tasks: {
        registerToolTask(name, meta, handler) {
          registeredToolTasks.push({ name, meta, handler });
        }
      }
    }
  };

  const selected = [
    {
      name: 'standard_tool',
      title: 'Standard tool',
      description: 'Regular registration path',
      requiresAuth: false,
      inputSchema: z.object({ value: z.string() }),
      handler: async () => ({ ok: true })
    },
    {
      name: 'task_tool',
      title: 'Task tool',
      description: 'Task registration path',
      requiresAuth: false,
      inputSchema: z.object({ value: z.string() }),
      handler: async () => ({ ok: true }),
      taskRegistration: {
        execution: { taskSupport: 'required' },
        handler: {
          createTask: async () => ({ task: { taskId: 'task-1', status: 'working', createdAt: '2026-01-01T00:00:00.000Z', lastUpdatedAt: '2026-01-01T00:00:00.000Z', ttl: null } }),
          getTask: async () => ({ taskId: 'task-1', status: 'working', createdAt: '2026-01-01T00:00:00.000Z', lastUpdatedAt: '2026-01-01T00:00:00.000Z', ttl: null }),
          getTaskResult: async () => ({ content: [{ type: 'text', text: 'done' }] })
        }
      }
    }
  ];

  registerAllTools(fakeServer, undefined, undefined, undefined, selected);

  assert.deepEqual(
    registeredTools.map((entry) => entry.name),
    ['standard_tool']
  );
  assert.deepEqual(
    registeredToolTasks.map((entry) => entry.name),
    ['task_tool']
  );
  assert.equal(registeredToolTasks[0].meta.execution.taskSupport, 'required');
  assert.equal(typeof registeredTools[0].handler, 'function');
  assert.equal(typeof registeredToolTasks[0].handler.createTask, 'function');
});

test('registerAllTools includes OpenAI registration _meta when UI meta is enabled', () => {
  const registered = [];
  const fakeServer = {
    registerTool(name, meta, handler) {
      registered.push({ name, meta, handler });
    }
  };
  const selected = allTools.filter((tool) => tool.name === 'search_templates');

  registerAllTools(fakeServer, undefined, undefined, undefined, selected, {
    uiMetaEnabled: true
  });

  assert.equal(registered[0].name, 'search_templates');
  assert.equal(registered[0].meta._meta['openai/outputTemplate'], 'ui://widget/search-templates.html');
  assert.equal(registered[0].meta._meta['openai/widgetAccessible'], true);
});

test('registerAllTools omits OpenAI registration _meta when UI meta is disabled', () => {
  const registered = [];
  const fakeServer = {
    registerTool(name, meta, handler) {
      registered.push({ name, meta, handler });
    }
  };
  const selected = allTools.filter((tool) => tool.name === 'search_templates');

  registerAllTools(fakeServer, undefined, undefined, undefined, selected, {
    uiMetaEnabled: false
  });

  assert.equal(registered[0].name, 'search_templates');
  assert.equal('_meta' in registered[0].meta, false);
});

test('execute_task registers parameters as a string schema for object-limited clients', () => {
  const registered = [];
  const fakeServer = {
    experimental: {
      tasks: {
        registerToolTask(name, meta, handler) {
          registered.push({ name, meta, handler });
        }
      }
    },
    registerTool(name, meta, handler) {
      registered.push({ name, meta, handler });
    }
  };
  const selected = allTools.filter((tool) => tool.name === 'execute_task');

  registerAllTools(fakeServer, undefined, undefined, undefined, selected);

  assert.equal(registered[0].name, 'execute_task');
  assert.equal(baseZodTypeName(registered[0].meta.inputSchema.parameters), 'ZodString');
});
