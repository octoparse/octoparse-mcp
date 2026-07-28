import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';
process.env.REDIS_ENABLED = 'false';

const {
  searchTemplateTool,
  executeTaskTool
} = await import('../dist/tools/workflow-tools.js');
const { SEARCH_WORKFLOW_HINT } = await import('../dist/tools/workflow-hints.js');
const { RedisClient } = await import('../dist/utils/redis.js');
const { AppConfig } = await import('../dist/config/app-config.js');

const sourceBackedParamsJson = JSON.stringify([
  {
    Id: '44b7f22e-ae69-f037-7912-25fafe69b9bb',
    DisplayText: 'Site',
    IsRequired: true,
    ParamName: '',
    DataType: 'String',
    ControlType: 'Dropdown',
    marks: { paramDisplayText: 'Site', description: '' },
    ControlOptions: {
      DataSourceType: 'External',
      ParentField: '',
      DataSource: 'DataSourc_xlsx',
      DataSourceFilter: '//root/A'
    }
  },
  {
    Id: '1f1effd0-b85c-7584-cdfb-2b4cd5798f5d',
    DisplayText: 'Confirm your site',
    IsRequired: true,
    ParamName: 'mcz8ihqnzzs.List',
    DataType: 'String',
    ControlType: 'CheckboxList',
    marks: { paramDisplayText: 'Confirm your site', description: '' },
    ControlOptions: {
      DataSourceType: 'External',
      ParentField: '44b7f22e-ae69-f037-7912-25fafe69b9bb',
      DataSource: 'DataSourc_xlsx',
      DataSourceFilter: '/B'
    }
  }
]);

const fieldDataSourceJson = JSON.stringify({
  DataSourc_xlsx:
    '<root><A name="United States"><B name="United States" value="https://www.amazon.com/" /></A><A name="United Kingdom"><B name="United Kingdom" value="https://www.amazon.co.uk/" /></A><A name="United States"><B name="United States Outlet" value="https://www.amazon.com/outlet" /></A></root>'
});

test('search_templates keyword mode returns source summary only for source-backed templates', async () => {
  const api = {
    searchTemplates: async () => ({
      data: [
        {
          id: 42,
          slug: 'amazon-site-selector',
          name: 'Amazon Site Selector',
          description: 'Cloud template',
          runOn: 2,
          likes: 120
        }
      ]
    }),
    getTemplateCurrentVersions: async () => ([
      {
        id: 420,
        version: 7,
        templateId: 42,
        parameters: sourceBackedParamsJson,
        fieldDataSource: fieldDataSourceJson
      }
    ])
  };

  const result = await searchTemplateTool.handler({ keyword: 'amazon' }, api);

  assert.equal(result.success, true);
  assert.equal(result.templates[0].sourceSummary.hasSourceOptions, true);
  assert.equal(result.templates[0].sourceSummary.hasDependentSourceOptions, true);
  assert.equal(result.templates[0].sourceSummary.rootOptionCount, 2);
  assert.equal('sourceOptions' in result.templates[0], false);
});

test('search_templates exact mode returns root sourceOptions and inputSchema metadata', async () => {
  const api = {
    getTemplateBySlug: async (slug) => ({
      id: 42,
      slug,
      name: 'Amazon Site Selector',
      prompts: 'Select site first.',
      runOn: 2,
      currentVersion: {
        templateVersionId: 420,
        version: 7,
        type: 1
      },
      parameters: sourceBackedParamsJson
    }),
    getTemplateCurrentVersion: async () => ({
      id: 420,
      version: 7,
      templateId: 42,
      parameters: sourceBackedParamsJson,
      fieldDataSource: fieldDataSourceJson
    })
  };

  const result = await searchTemplateTool.handler({ slug: 'amazon-site-selector' }, api);

  assert.equal(result.success, true);
  assert.deepEqual(result.template.sourceOptions.site, [
    { key: 'United States', label: 'United States' },
    { key: 'United Kingdom', label: 'United Kingdom' }
  ]);
  assert.equal(result.template.inputSchema[0].field, 'site');
  assert.equal(result.template.inputSchema[0].label, 'Site');
  assert.equal(result.template.inputSchema[0].fieldId, '44b7f22e-ae69-f037-7912-25fafe69b9bb');
  assert.equal(result.template.inputSchema[1].dependsOn, 'site');
  assert.equal('fieldKeyMap' in result.template, false);
});

test('execute_task validateOnly returns dependent sourceOptions without creating a task', async () => {
  let createTaskCalls = 0;

  const api = {
    getTemplateBySlug: async () => ({
      id: 42,
      slug: 'amazon-site-selector',
      name: 'Amazon Site Selector',
      runOn: 2,
      currentVersion: {
        templateVersionId: 420,
        version: 7,
        type: 1
      },
      parameters: sourceBackedParamsJson
    }),
    getTemplateCurrentVersion: async () => ({
      id: 420,
      version: 7,
      templateId: 42,
      parameters: sourceBackedParamsJson,
      fieldDataSource: fieldDataSourceJson
    }),
    createTemplateTask: async () => {
      createTaskCalls += 1;
      return { taskId: 'unexpected' };
    }
  };

  const result = await executeTaskTool.handler(
    {
      templateName: 'amazon-site-selector',
      validateOnly: true,
      parameters: {
        site: 'United States'
      }
    },
    api
  );

  assert.equal(result.success, true);
  assert.equal(result.validateOnly, true);
  assert.equal(result.status, 'awaiting_source_selection');
  assert.equal(result.canExecuteNow, false);
  assert.deepEqual(result.blockingIssues, ['confirm_your_site']);
  assert.match(result.nextAction, /select/i);
  assert.equal(result.inputSchema[0].field, 'site');
  assert.equal(result.inputSchema[1].field, 'confirm_your_site');
  assert.deepEqual(result.sourceOptions, {
    confirm_your_site: [
      { key: 'https://www.amazon.com/', label: 'United States' },
      { key: 'https://www.amazon.com/outlet', label: 'United States Outlet' }
    ]
  });
  assert.deepEqual(result.awaitingDependency, []);
  assert.deepEqual(result.invalidSourceSelections, []);
  assert.equal('fieldKeyMap' in result, false);
  assert.equal(createTaskCalls, 0);
});

test('execute_task accepts source-backed field keys in normal execution', async () => {
  let receivedUserInputParameters = null;

  const api = {
    getTemplateBySlug: async () => ({
      id: 42,
      slug: 'amazon-site-selector',
      name: 'Amazon Site Selector',
      runOn: 2,
      currentVersion: {
        templateVersionId: 420,
        version: 7,
        type: 1
      },
      parameters: sourceBackedParamsJson
    }),
    getTemplateCurrentVersion: async () => ({
      id: 420,
      version: 7,
      templateId: 42,
      parameters: sourceBackedParamsJson,
      fieldDataSource: fieldDataSourceJson
    }),
    createTemplateTask: async (_templateId, _taskName, _taskGroupId, userInputParameters) => {
      receivedUserInputParameters = userInputParameters;
      return { taskId: 'task-42' };
    },
    startTask: async () => ({ result: 0 }),
    getTaskStatus: async () => ([
      {
        taskId: 'task-42',
        status: 'Finished',
        currentTotalExtractCount: 2
      }
    ])
  };

  const result = await executeTaskTool.handler(
    {
      templateName: 'amazon-site-selector',
      parameters: {
        site: 'United States',
        confirm_your_site: ['https://www.amazon.com/']
      }
    },
    api
  );

  assert.equal(result.success, true);
  assert.equal(result.status, 'accepted');
  assert.deepEqual(receivedUserInputParameters.UIParameters, [
    {
      Id: '44b7f22e-ae69-f037-7912-25fafe69b9bb',
      Value: 'United States',
      Customize: { taskUrlRuleParam: [] },
      sourceTaskId: '',
      sourceField: ''
    },
    {
      Id: '1f1effd0-b85c-7584-cdfb-2b4cd5798f5d',
      Value: ['https://www.amazon.com/'],
      Customize: { taskUrlRuleParam: [] },
      sourceTaskId: '',
      sourceField: ''
    }
  ]);
  assert.deepEqual(receivedUserInputParameters.TemplateParameters, [
    {
      ParamName: '',
      Value: 'United States'
    },
    {
      ParamName: 'mcz8ihqnzzs.List',
      Value: ['https://www.amazon.com/']
    }
  ]);
});

test('execute_task ignores missing sourceSchema.fieldKeyMap from cached schema entries', async () => {
  const originalRedisEnabled = process.env.REDIS_ENABLED;
  const originalRedisInstance = RedisClient.instance;
  const originalIsConnecting = RedisClient.isConnecting;

  process.env.REDIS_ENABLED = 'true';
  AppConfig.reset();

  RedisClient.instance = {
    get: async () =>
      JSON.stringify({
        templateId: 88,
        versionId: 880,
        version: 3,
        acceptLanguage: 'en-US',
        parameters: JSON.stringify([
          {
            Id: 'ui-1',
            ParamName: 'SearchKeyword',
            DisplayText: 'Search Keyword',
            ControlType: 'MultiInput',
            IsRequired: true
          }
        ]),
        sourceSchema: {
          templateId: 88,
          versionId: 880,
          acceptLanguage: 'en-US',
          rootFieldOptions: {},
          dependencyOptionIndex: {}
        }
      }),
    set: async () => 'OK'
  };
  RedisClient.isConnecting = false;

  const api = {
    getTemplateBySlug: async () => ({
      id: 88,
      slug: 'cached-template',
      name: 'Cached Template',
      runOn: 2,
      currentVersion: {
        templateVersionId: 880,
        version: 3,
        type: 1
      },
      parameters: JSON.stringify([
        {
          Id: 'ui-1',
          ParamName: 'SearchKeyword',
          DisplayText: 'Search Keyword',
          ControlType: 'MultiInput',
          IsRequired: true
        }
      ])
    }),
    getTemplateCurrentVersion: async () => {
      throw new Error('cache should have satisfied schema load');
    },
    createTemplateTask: async () => ({ taskId: 'task-88' }),
    startTask: async () => ({ result: 0 }),
    getTaskStatus: async () => ([
      {
        taskId: 'task-88',
        status: 'Finished',
        currentTotalExtractCount: 1
      }
    ])
  };

  try {
    const result = await executeTaskTool.handler(
      {
        templateName: 'cached-template',
        parameters: {
          search_keyword: ['iphone']
        }
      },
      api
    );

    assert.equal(result.success, true);
    assert.equal(result.status, 'accepted');
  } finally {
    process.env.REDIS_ENABLED = originalRedisEnabled;
    RedisClient.instance = originalRedisInstance;
    RedisClient.isConnecting = originalIsConnecting;
    AppConfig.reset();
  }
});

test('tool descriptions and workflow hints explain sourceOptions discovery flow', () => {
  assert.match(searchTemplateTool.description, /Keyword mode returns .*source summaries/i);
  assert.match(searchTemplateTool.description, /exact lookup returns a single `template` with full `inputSchema`/i);
  assert.match(executeTaskTool.description, /dependent `sourceOptions` from `validateOnly=true`/i);
  assert.match(SEARCH_WORKFLOW_HINT.sourceOptionsRule, /Use exact lookup to inspect root-level sourceOptions/i);
  assert.doesNotMatch(executeTaskTool.description, /parameterHints|fieldKeyMap/i);
});
