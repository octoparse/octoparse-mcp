import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';

const { EnumLabelUtil } = await import('../dist/utils/enum-mapper.js');
const { searchTasksTool, startOrStopTaskTool } = await import('../dist/tools/task-tools.js');
const { exportDataTool } = await import('../dist/tools/export-data-tool.js');
const { SelfCorrectionErrorBuilder } = await import('../dist/errors/self-correction-errors.js');
const {
  AsyncExportFileStatus,
  TaskExecuteStatus
} = await import('../dist/api/types.js');

test('EnumLabelUtil maps supported enum values to readable labels', () => {
  assert.equal(EnumLabelUtil.runOnLabel(1), 'Local only');
  assert.equal(EnumLabelUtil.startTaskResult(1003), 'USER_INSUFFICIENT_PERMISSION');
  assert.equal(EnumLabelUtil.taskStatus(2), 'Executing');
  assert.equal(EnumLabelUtil.asyncExportFileStatus(3), 'Obsolete');
  assert.equal(EnumLabelUtil.accountLevel(31), 'Enterprise');
});

test('search_tasks returns taskStatusLabel beside rawTaskStatusCode', async () => {
  const api = {
    searchTaskList: async () => ({
      total: 1,
      pageIndex: 1,
      pageSize: 10,
      currentTotal: 1,
      dataList: [
        {
          taskId: 'task-1',
          taskName: 'Task 1',
          taskStatus: 2,
          taskGroupId: 10
        }
      ]
    })
  };

  const result = await searchTasksTool.handler({}, api);

  assert.equal(result.success, true);
  assert.equal(result.tasks[0].rawTaskStatusCode, 2);
  assert.equal(result.tasks[0].taskStatusLabel, 'Unknown');
});

test('start_or_stop_task returns startResultLabel on rejected start result', async () => {
  const api = {
    getTaskStatus: async () => [{ taskId: 'task-2', status: 'Stopped' }],
    startTask: async () => ({ result: 1001 })
  };

  const result = await startOrStopTaskTool.handler(
    {
      taskId: 'task-2',
      action: 'start'
    },
    api
  );

  assert.equal(result.success, false);
  assert.equal(result.startResultCode, 1001);
  assert.equal(result.startResultLabel, 'USER_SUSPENDED');
});

test('export_data returns latestExportFileStatusLabel with export metadata', async () => {
  const api = {
    getTaskStatusById: async () => ({
      taskId: 'task-3',
      status: TaskExecuteStatus.Finished,
      lot: 'lot-3',
      dataCount: 3
    }),
    createAsyncCloudStorageExport: async () => {},
    getLastExportPreview: async () => ({
      latestExportFileUrl: 'https://download.example.com/task-3.json',
      latestExportFileStatus: AsyncExportFileStatus.Generated,
      exportProgressPercent: 100,
      collectedDataTotal: 3,
      collectedDataSample: [{ title: 'Row 1' }]
    })
  };

  const result = await exportDataTool.handler(
    {
      taskId: 'task-3'
    },
    api
  );

  assert.equal(result.success, true);
  assert.equal(result.latestExportFileStatus, AsyncExportFileStatus.Generated);
  assert.equal(result.latestExportFileStatusLabel, 'Generated');
});

test('cloudTaskPermissionDenied includes readable account level names in metadata', () => {
  const result = SelfCorrectionErrorBuilder.cloudTaskPermissionDenied({
    currentAccountLevel: 1,
    allowedAccountLevels: [3, 31]
  });

  assert.equal(result.metadata.currentAccountLevel, 1);
  assert.equal(result.metadata.currentAccountLevelName, 'Free');
  assert.deepEqual(result.metadata.allowedAccountLevelNames, ['Professional', 'Enterprise']);
});
