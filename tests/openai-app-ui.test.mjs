import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';
import ts from 'typescript';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';
process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://widgets.example.com';
process.env.LOG_ENABLE_CONSOLE = 'false';
process.env.LOG_ENABLE_FILE = 'false';

const { executeToolWithMiddleware } = await import('../dist/tools/tool-registry.js');
const { RequestContextManager } = await import('../dist/utils/request-context.js');
const { registerAllResources } = await import('../dist/resources.js');
const { presentSearchTemplatesResult } = await import(
  '../dist/widget-adapter/presenters/search-templates.presenter.js'
);
const { presentSearchTasksResult } = await import(
  '../dist/widget-adapter/presenters/search-tasks.presenter.js'
);

const REMOVED_SEARCH_TEMPLATE_RESPONSE_FIELDS = [
  'selectedTemplateRef',
  'generatedParameterSummary',
  'generatedExecuteTaskSuggestion',
  'nextStepHint'
];

function assertRemovedSearchTemplateResponseFieldsAbsent(record) {
  for (const field of REMOVED_SEARCH_TEMPLATE_RESPONSE_FIELDS) {
    assert.equal(field in record, false);
  }
}

test('widget CSP allows template images from Octoparse image CDNs', async () => {
  const registered = [];
  registerAllResources({
    registerResource(name, uri, meta, handler) {
      registered.push({ name, uri, meta, handler });
    }
  }, {
    uiMetaEnabled: true
  });

  const searchTemplatesResource = registered.find((resource) => resource.name === 'search-templates-widget');
  assert.ok(searchTemplatesResource);

  const response = await searchTemplatesResource.handler();
  assert.equal(searchTemplatesResource.meta.mimeType, 'text/html;profile=mcp-app');
  assert.equal(response.contents[0].mimeType, 'text/html;profile=mcp-app');
  assert.equal(response.contents[0]._meta.ui.prefersBorder, true);
  assert.equal(response.contents[0]._meta['openai/widgetPrefersBorder'], true);

  const csp = response.contents[0]._meta.ui.csp;

  assert.ok(csp.resource_domains.includes('https://image.bazhuayu.com'));
  assert.ok(csp.resource_domains.includes('https://op.image.skieer.com'));
  assert.deepEqual(response.contents[0]._meta['openai/widgetCSP'], csp);
});

test('search templates bootstrap uses a waiting-state payload until search template data arrives', () => {
  return withBootstrapModule((bootstrap) => {
    withWindowState(undefined, undefined, () => {
      assert.deepEqual(bootstrap.getTemplateWidgetPayload(), {
        isLoading: true,
        cards: [],
        banner: null,
        pagination: {
          page: 1,
          pageSize: 0,
          total: 0
        },
        structuredContent: {
          recommendedTemplateName: null
        }
      });
    });
  });
});

test('search templates presenter omits legacy selection guidance and preserves schema in structured content', () => {
  const response = presentSearchTemplatesResult(
    {
      success: true,
      queryMode: 'keyword',
      selectedTemplateRef: {
        templateId: 42,
        templateName: 'google_maps_places',
        displayName: 'Google Maps Places'
      },
      generatedParameterSummary: 'Keyword: coffee shops in Seattle',
      generatedExecuteTaskSuggestion: 'Execute this template with the detected keyword.',
      nextStepHint: 'Review the selected template, then run the task.',
      templates: [
        {
          templateName: 'google_maps_places',
          displayName: 'Google Maps Places',
          templateRef: {
            templateId: 42,
            templateName: 'google_maps_places',
            displayName: 'Google Maps Places'
          },
          downloadUrl: 'https://octoparse.example.com/download',
          inputSchema: [{ field: 'keyword', type: 'string[]' }],
          outputSchema: [{ field: 'name', type: 'string' }]
        }
      ]
    },
    {
      resourceUri: 'ui://widget/search-templates.html'
    }
  );

  assertRemovedSearchTemplateResponseFieldsAbsent(response.structuredContent);
  assertRemovedSearchTemplateResponseFieldsAbsent(response._meta);
  assert.deepEqual(response.structuredContent.templates[0].inputSchema, [
    { field: 'keyword', type: 'string[]' }
  ]);
  assert.deepEqual(response.structuredContent.templates[0].outputSchema, [
    { field: 'name', type: 'string' }
  ]);
  for (const field of [
    'kindIds',
    'kindLabels',
    'supportsCloudScraping',
    'selectable',
    'selectionMode',
    'templateRef'
  ]) {
    assert.equal(field in response.structuredContent.templates[0], false);
  }
  assert.equal(response.structuredContent.widgetRendered, true);
  assert.equal(
    response._meta.useTemplatePromptTemplate,
    'I want to use the [{templateName}] template to run a collection. Please help me prepare the required parameters.'
  );
  assert.equal(response._meta['openai/widgetAccessible'], true);
  assert.equal(response._meta.cards[0].templateRef.templateId, 42);
  for (const field of [
    'kindIds',
    'kindLabels',
    'supportsCloudScraping',
    'selectable',
    'selectionMode'
  ]) {
    assert.equal(field in response._meta.cards[0], false);
  }
  assert.equal(
    response._meta.cards[0].downloadUrl,
    'https://octoparse.example.com/download'
  );
  assert.equal('inputSchema' in response._meta.cards[0], false);
  assert.equal('outputSchema' in response._meta.cards[0], false);
});

test('search templates bootstrap normalizes cards and pagination from tool output metadata', () => {
  return withBootstrapModule((bootstrap) => {
    withWindowState(
      {
        structuredContent: {
          recommendedTemplateName: 'google_maps_places'
        },
        _meta: {
          cards: [
            {
              templateName: 'google_maps_places',
              displayName: 'Google Maps Places',
              templateRef: {
                templateId: 42,
                templateName: 'google_maps_places',
                displayName: 'Google Maps Places'
              },
              downloadUrl: 'https://octoparse.example.com/download',
              inputSchema: [{ field: 'keyword', type: 'string[]' }],
              outputSchema: [{ field: 'name', type: 'string' }]
            }
          ],
          pagination: {
            page: 2,
            pageSize: 10,
            total: 17
          }
        }
      },
      undefined,
      () => {
        assert.deepEqual(bootstrap.getTemplateWidgetPayload(), {
          isLoading: false,
          cards: [
            {
              templateName: 'google_maps_places',
              displayName: 'Google Maps Places',
              shortDescription: undefined,
              imageUrl: undefined,
              templateRef: {
                templateId: 42,
                templateName: 'google_maps_places',
                displayName: 'Google Maps Places'
              },
              executionMode: undefined,
              popularityLikes: undefined,
              priceLabel: undefined,
              lastModifiedLabel: undefined,
              iconKey: undefined,
              note: undefined,
              downloadUrl: 'https://octoparse.example.com/download',
              sourceOptions: undefined,
              inputSchema: [{ field: 'keyword', type: 'string[]' }],
              outputSchema: [{ field: 'name', type: 'string' }]
            }
          ],
          banner: null,
          pagination: {
            page: 2,
            pageSize: 10,
            total: 17
          },
          structuredContent: {
            recommendedTemplateName: 'google_maps_places'
          }
        });
      }
    );
  });
});

test('search templates bootstrap falls back to a safe degraded payload when tool output exists but template normalization fails', () => {
  return withBootstrapModule((bootstrap) => {
    withWindowState(
      {
        structuredContent: {
          recommendedTemplateName: 'fallback-template'
        },
        _meta: {
          cards: {
            invalid: true
          }
        }
      },
      undefined,
      () => {
        assert.deepEqual(bootstrap.getTemplateWidgetPayload(), {
          isLoading: false,
          cards: [],
          banner: null,
          pagination: {
            page: 1,
            pageSize: 0,
            total: 0
          },
          structuredContent: {
            recommendedTemplateName: 'fallback-template'
          }
        });
      }
    );
  });
});

test('search templates bootstrap ignores legacy selection guidance fields from structuredContent', () => {
  return withBootstrapModule((bootstrap) => {
    withWindowState(
      {
        structuredContent: {
          recommendedTemplateName: 'meta-fallback',
          selectedTemplateRef: {
            templateId: 55,
            templateName: 'meta-fallback',
            displayName: 'Meta Fallback'
          },
          generatedParameterSummary: 'summary from structured content',
          generatedExecuteTaskSuggestion: 'suggestion from structured content',
          nextStepHint: 'hint from structured content'
        },
        _meta: {
          cards: [
            {
              templateName: 'meta-fallback',
              displayName: 'Meta Fallback'
            }
          ]
        }
      },
      undefined,
      () => {
        assert.deepEqual(bootstrap.getTemplateWidgetPayload(), {
          isLoading: false,
          cards: [
            {
              templateName: 'meta-fallback',
              displayName: 'Meta Fallback',
              shortDescription: undefined,
              imageUrl: undefined,
              templateRef: null,
              executionMode: undefined,
              popularityLikes: undefined,
              priceLabel: undefined,
              lastModifiedLabel: undefined,
              iconKey: undefined,
              note: undefined,
              downloadUrl: undefined,
              sourceOptions: undefined,
              inputSchema: undefined,
              outputSchema: undefined
            }
          ],
          banner: null,
          pagination: {
            page: 1,
            pageSize: 1,
            total: 1
          },
          structuredContent: {
            recommendedTemplateName: 'meta-fallback'
          }
        });
      }
    );
  });
});

test('search templates bootstrap ignores legacy selection guidance fields from metadata', () => {
  return withBootstrapModule((bootstrap) => {
    withWindowState(
      {
        structuredContent: {
          recommendedTemplateName: 'metadata-template'
        },
        _meta: {
          cards: [
            {
              templateName: 'metadata-template',
              displayName: 'Metadata Template'
            }
          ],
          generatedParameterSummary: '',
          generatedExecuteTaskSuggestion: '',
          nextStepHint: ''
        }
      },
      undefined,
      () => {
        const payload = bootstrap.getTemplateWidgetPayload();
        assertRemovedSearchTemplateResponseFieldsAbsent(payload);
        assert.deepEqual(payload.structuredContent, {
          recommendedTemplateName: 'metadata-template'
        });
      }
    );
  });
});

test('search tasks presenter passes action prompt templates and keeps model text summarized for UI lists', () => {
  const response = presentSearchTasksResult(
    {
      success: true,
      page: 1,
      size: 2,
      total: 2,
      currentTotal: 2,
      totalPages: 1,
      tasks: [
        {
          taskId: 'task-running',
          taskName: 'Running Task',
          taskStatusLabel: 'Running',
          rawTaskStatusCode: 1,
          taskDescription: 'Detailed running task description'
        },
        {
          taskId: 'task-stopped',
          taskName: 'Stopped Task',
          taskStatusLabel: 'Stopped',
          rawTaskStatusCode: 2,
          taskDescription: 'Detailed stopped task description'
        }
      ]
    },
    {
      resourceUri: 'ui://widget/search-tasks.html'
    }
  );

  assert.equal(response.content[0].text, 'UI already shows the task rows. Found 2 task results.');
  assert.doesNotMatch(response.content[0].text, /task-running|Running Task|Detailed running task description/);
  assert.equal(response._meta.startTaskPromptTemplate, 'Try to start or restart task {taskId}.');
  assert.equal(response._meta.stopTaskPromptTemplate, 'Try to stop task {taskId}.');
  assert.equal(response._meta.rows[0].statusTone, 'running');
  assert.equal(response._meta.rows[1].statusTone, 'stopped');
});

test('executeToolWithMiddleware preserves structuredContent and widget _meta for widget-enabled tools', async () => {
  const tool = {
    name: 'widget_tool',
    title: 'Widget tool',
    description: 'Returns a widget result',
    requiresAuth: false,
    inputSchema: z.object({ keyword: z.string() }),
    uiBinding: {
      resourceUri: 'ui://widget/search-templates.html',
      presenter(result) {
        return {
          content: [
            {
              type: 'text',
              text: `Prepared widget for ${result.keyword}`
            }
          ],
          structuredContent: {
            keyword: result.keyword,
            total: result.total
          },
          _meta: {
            'openai/outputTemplate': 'ui://widget/search-templates.html',
            cards: result.cards
          }
        };
      }
    },
    handler: async (input) => ({
      keyword: input.keyword,
      total: 1,
      cards: [{ id: 'card-1' }]
    })
  };

  const response = await RequestContextManager.runWithContext(
    {
      requestId: 'req-openai-widget-tool',
      correlationId: 'corr-openai-widget-tool',
      startTime: Date.now(),
      clientName: 'openai-mcp'
    },
    () => executeToolWithMiddleware(tool, async () => undefined, {
      keyword: 'maps'
    })
  );

  assert.equal(response.content[0].text, 'Prepared widget for maps');
  assert.deepEqual(response.structuredContent, {
    keyword: 'maps',
    total: 1
  });
  assert.equal(response._meta['openai/outputTemplate'], 'ui://widget/search-templates.html');
  assert.deepEqual(response._meta.cards, [{ id: 'card-1' }]);
});

test('registerAllResources registers the OpenAI App widget resources', () => {
  const registered = [];
  const fakeServer = {
    registerResource(name, uri, meta, handler) {
      registered.push({ name, uri, meta, handler });
    }
  };

  registerAllResources(fakeServer, { uiMetaEnabled: true });

  assert.equal(
    registered.some((entry) => entry.uri === 'ui://widget/search-templates.html'),
    true
  );
  assert.equal(
    registered.some((entry) => entry.uri === 'ui://widget/search-tasks.html'),
    true
  );
});

test('registerAllResources keeps widget resources without OpenAI UI metadata when UI meta is disabled', async () => {
  const registered = [];
  const fakeServer = {
    registerResource(name, uri, meta, handler) {
      registered.push({ name, uri, meta, handler });
    }
  };

  registerAllResources(fakeServer, { uiMetaEnabled: false });

  const searchTemplatesResource = registered.find((entry) => entry.uri === 'ui://widget/search-templates.html');
  const searchTasksResource = registered.find((entry) => entry.uri === 'ui://widget/search-tasks.html');

  assert.ok(searchTemplatesResource);
  assert.ok(searchTasksResource);
  assert.equal(
    registered.some((entry) => entry.uri === 'octoparse://workflow'),
    true
  );

  const response = await searchTemplatesResource.handler();
  assert.equal(searchTemplatesResource.meta.mimeType, 'text/plain');
  assert.equal(response.contents[0].uri, 'ui://widget/search-templates.html');
  assert.equal(response.contents[0].mimeType, 'text/plain');
  assert.equal(response.contents[0].text, '');
  assert.equal(response.contents[0]._meta, undefined);
});

async function loadBootstrapModule() {
  const sourcePath = path.resolve(process.cwd(), 'web', 'src', 'shared', 'bootstrap.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    },
    fileName: sourcePath
  });

  const tempDir = path.resolve(process.cwd(), 'web', '.tmp-test-modules');
  fs.mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(
    tempDir,
    `bootstrap-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`
  );
  fs.writeFileSync(tempPath, transpiled.outputText, 'utf8');

  try {
    return await import(pathToFileURL(tempPath).href);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

async function withBootstrapModule(run) {
  const tempDir = path.resolve(process.cwd(), 'web', '.tmp-test-modules');
  cleanupBootstrapTempModules(tempDir);
  const bootstrap = await loadBootstrapModule();

  try {
    return await run(bootstrap);
  } finally {
    const after = listBootstrapTempModules(tempDir);
    assert.deepEqual(after, []);
  }
}

function listBootstrapTempModules(tempDir) {
  if (!fs.existsSync(tempDir)) {
    return [];
  }

  return fs.readdirSync(tempDir).filter((entry) => entry.startsWith('bootstrap-'));
}

function cleanupBootstrapTempModules(tempDir) {
  const entries = listBootstrapTempModules(tempDir);
  for (const entry of entries) {
    fs.unlinkSync(path.join(tempDir, entry));
  }
}

function withWindowState(toolOutput, toolResponseMetadata, run) {
  const previousWindow = globalThis.window;
  globalThis.window = {
    openai: {
      toolOutput,
      toolResponseMetadata
    }
  };

  try {
    return run();
  } finally {
    globalThis.window = previousWindow;
  }
}
