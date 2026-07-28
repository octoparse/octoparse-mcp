import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';
process.env.SEARCH_TEMPLATE_PAGE_SIZE = process.env.SEARCH_TEMPLATE_PAGE_SIZE || '8';
process.env.EXECUTE_TASK_POLL_MAX_MINUTES = process.env.EXECUTE_TASK_POLL_MAX_MINUTES || '10';

const { OctoparseApi } = await import('../dist/api/octoparse.js');
const { HttpClientFactory } = await import('../dist/api/clients/http-client-factory.js');
const { StartTaskErrorCode, StartTaskResult } = await import('../dist/api/types.js');
const { startOrStopTaskTool } = await import('../dist/tools/task-tools.js');
const { executeTaskTool } = await import('../dist/tools/workflow-tools.js');
const messages = (await import('../dist/config/messages.js')).default;

const expectedPermissionMessage = messages.errors.task.start.noPermission;

test('OctoparseApi.startTask normalizes NoPermission into a permission guidance result', async () => {
  const originalGetClientApiClient = HttpClientFactory.getClientApiClient;
  HttpClientFactory.getClientApiClient = () => ({
    post: async () => ({
      error: 'NoPermission',
      error_description: 'NoPermission'
    })
  });

  try {
    const api = new OctoparseApi({});
    const result = await api.startTask('task-no-permission');

    assert.equal(result.result, StartTaskResult.USER_INSUFFICIENT_PERMISSION);
    assert.equal(result.errorCode, StartTaskErrorCode.FUNCTION_NOT_ENABLE);
    assert.equal(result.message, expectedPermissionMessage);
  } finally {
    HttpClientFactory.getClientApiClient = originalGetClientApiClient;
  }
});

test('start_or_stop_task returns the NoPermission guidance to the user', async () => {
  const api = {
    getTaskStatus: async () => [{ taskId: 'task-2', status: 'Stopped' }],
    startTask: async () => ({
      result: StartTaskResult.USER_INSUFFICIENT_PERMISSION,
      errorCode: StartTaskErrorCode.FUNCTION_NOT_ENABLE,
      message: expectedPermissionMessage
    })
  };

  const result = await startOrStopTaskTool.handler(
    {
      taskId: 'task-2',
      action: 'start'
    },
    api
  );

  assert.equal(result.success, false);
  assert.equal(result.error, 'insufficient_permission');
  assert.equal(result.message, expectedPermissionMessage);
  assert.equal(result.requiresUserAction, true);
});

test('start_or_stop_task includes lot from startTask response when start is accepted', async () => {
  const api = {
    getTaskStatus: async () => [{ taskId: 'task-lot', status: 'Stopped' }],
    startTask: async () => ({
      result: StartTaskResult.SUCCESS,
      lotNo: 'lot-start-1'
    })
  };

  const result = await startOrStopTaskTool.handler(
    {
      taskId: 'task-lot',
      action: 'start'
    },
    api
  );

  assert.equal(result.success, true);
  assert.equal(result.status, 'start_requested');
  assert.equal(result.lot, 'lot-start-1');
});

test('start_or_stop_task resolves thrown start error code case-insensitively before falling back to message', async () => {
  const api = {
    getTaskStatus: async () => [{ taskId: 'task-throw', status: 'Stopped' }],
    startTask: async () => {
      const error = new Error('NoPermission');
      error.code = 'nOpErMiSsIoN';
      throw error;
    }
  };

  const result = await startOrStopTaskTool.handler(
    {
      taskId: 'task-throw',
      action: 'start'
    },
    api
  );

  assert.equal(result.success, false);
  assert.equal(result.error, 'task_start_failed');
  assert.equal(result.message, expectedPermissionMessage);
});

test('execute_task surfaces the NoPermission guidance when cloud start is rejected', async () => {
  const paramsJson = JSON.stringify([
    {
      Id: 'ui-1',
      ParamName: 'SearchKeyword',
      DisplayText: 'Search Keyword',
      ControlType: 'MultiInput',
      IsRequired: true
    }
  ]);

  const api = {
    getTemplateBySlug: async () => ({
      id: 42,
      runOn: 2,
      name: 'Amazon Cloud',
      parameters: paramsJson,
      userPermission: { hasPermission: true }
    }),
    getAccountInfo: async () => ({ currentAccountLevel: 120 }),
    getTemplateCurrentVersion: async () => ({
      id: 420,
      version: 7,
      parameters: paramsJson
    }),
    createTemplateTask: async () => ({ taskId: 'task-42' }),
    startTask: async () => ({
      result: StartTaskResult.USER_INSUFFICIENT_PERMISSION,
      errorCode: StartTaskErrorCode.FUNCTION_NOT_ENABLE,
      message: expectedPermissionMessage
    })
  };

  const result = await executeTaskTool.handler(
    {
      templateName: 'amazon-cloud',
      parameters: {
        search_keyword: ['iphone']
      }
    },
    api
  );

  assert.equal(result.success, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.message, expectedPermissionMessage);
  assert.equal(result.startResultLabel, 'USER_INSUFFICIENT_PERMISSION');
});

test('execute_task resolves thrown start error code case-insensitively before falling back to message', async () => {
  const paramsJson = JSON.stringify([
    {
      Id: 'ui-1',
      ParamName: 'SearchKeyword',
      DisplayText: 'Search Keyword',
      ControlType: 'MultiInput',
      IsRequired: true
    }
  ]);

  const api = {
    getTemplateBySlug: async () => ({
      id: 42,
      runOn: 2,
      name: 'Amazon Cloud',
      parameters: paramsJson,
      userPermission: { hasPermission: true }
    }),
    getAccountInfo: async () => ({ currentAccountLevel: 120 }),
    getTemplateCurrentVersion: async () => ({
      id: 420,
      version: 7,
      parameters: paramsJson
    }),
    createTemplateTask: async () => ({ taskId: 'task-throw-42' }),
    startTask: async () => {
      const error = new Error('NoPermission');
      error.code = 'NOPERMISSION';
      throw error;
    }
  };

  const result = await executeTaskTool.handler(
    {
      templateName: 'amazon-cloud',
      parameters: {
        search_keyword: ['iphone']
      }
    },
    api
  );

  assert.equal(result.success, false);
  assert.equal(result.error, 'cloud_start_failed');
  assert.equal(result.message, expectedPermissionMessage);
});
