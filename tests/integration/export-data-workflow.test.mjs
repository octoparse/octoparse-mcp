import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';

const { exportDataTool } = await import('../../dist/tools/export-data-tool.js');
const {
  AsyncExportFileStatus,
  TaskExecuteStatus
} = await import('../../dist/api/types.js');

test('export_data returns exported preview rows from the authoritative export tool', async () => {
  const api = {
    getTaskStatusById: async () => ({
      taskId: 'task-1',
      status: TaskExecuteStatus.Finished,
      lot: 'lot-1',
      dataCount: 2
    }),
    createAsyncCloudStorageExport: async () => {},
    getLastExportPreview: async () => ({
      latestExportFileStatus: AsyncExportFileStatus.Generated,
      latestExportFileUrl: 'https://download.example.com/export.json',
      collectedDataTotal: 2,
      collectedDataSample: [
        { title: 'Row 1', price: '$10' },
        { title: 'Row 2', price: '$20' }
      ]
    })
  };

  const result = await exportDataTool.handler(
    {
      taskId: 'task-1'
    },
    api
  );

  assert.equal(result.success, true);
  assert.equal(result.status, 'exported');
  assert.equal(result.lot, 'lot-1');
  assert.equal(result.dataTotal, 2);
  assert.equal(result.exportFileUrl, 'https://download.example.com/export.json');
  assert.equal(result.sampleData.length, 2);
  assert.equal(result.sampleRowCount, 2);
  assert.match(result.toolHint, /Present sampleData as a table/i);
});

test('export_data truncates long preview values for token efficiency', async () => {
  const api = {
    getTaskStatusById: async () => ({
      taskId: 'task-compact',
      status: TaskExecuteStatus.Finished,
      lot: 'lot-compact',
      dataCount: 1
    }),
    createAsyncCloudStorageExport: async () => {},
    getLastExportPreview: async () => ({
      latestExportFileStatus: AsyncExportFileStatus.Generated,
      latestExportFileUrl: 'https://download.example.com/export.json',
      collectedDataTotal: 1,
      collectedDataSample: [
        {
          a: 'x'.repeat(220),
          b: 'value-b',
          nested: {
            text: 'y'.repeat(220)
          }
        }
      ]
    })
  };

  const result = await exportDataTool.handler(
    {
      taskId: 'task-compact'
    },
    api
  );

  assert.equal(result.success, true);
  assert.equal(result.status, 'exported');
  assert.equal(result.sampleData[0].a, `${'x'.repeat(128)}...`);
  assert.equal(result.sampleData[0].nested.text, `${'y'.repeat(128)}...`);
});

test('export_data returns collecting state while the task is still running', async () => {
  const api = {
    getTaskStatusById: async () => ({
      taskId: 'task-preview',
      status: TaskExecuteStatus.Executing,
      lot: 'lot-preview',
      dataCount: 2
    })
  };

  const result = await exportDataTool.handler(
    {
      taskId: 'task-preview'
    },
    api
  );

  assert.equal(result.success, true);
  assert.equal(result.status, 'collecting');
  assert.equal(result.taskStatus, TaskExecuteStatus.Executing);
  assert.equal(result.taskStatusLabel, 'Executing');
  assert.equal(result.dataTotal, 2);
  assert.equal(result.retryGuidance.tool, 'export_data');
  assert.equal(result.retryGuidance.waitSecondsMin, 10);
  assert.equal(result.retryGuidance.waitSecondsMax, 30);
  assert.match(result.retryGuidance.instruction, /10-30 seconds/i);
  assert.match(result.toolHint, /tasks\/get/i);
  assert.match(result.message, /prefer tasks\/get/i);
  assert.match(result.suggestion, /10-30 seconds/i);
});

test('export_data returns no_data when export completes without collected rows', async () => {
  const api = {
    getTaskStatusById: async () => ({
      taskId: 'task-exported',
      status: TaskExecuteStatus.Finished,
      lot: 'lot-exported',
      dataCount: 0
    }),
    createAsyncCloudStorageExport: async () => {},
    getLastExportPreview: async () => ({
      latestExportFileStatus: AsyncExportFileStatus.Generated,
      latestExportFileUrl: 'https://download.example.com/task-exported.json',
      collectedDataTotal: 0,
      collectedDataSample: []
    })
  };

  const result = await exportDataTool.handler(
    {
      taskId: 'task-exported'
    },
    api
  );

  assert.equal(result.success, true);
  assert.equal(result.status, 'no_data');
  assert.equal(result.lot, 'lot-exported');
  assert.equal(result.exportFileUrl, 'https://download.example.com/task-exported.json');
  assert.match(result.message, /no data was collected/i);
});

test('export_data returns exporting retry guidance while export file is still being generated', async () => {
  const api = {
    getTaskStatusById: async () => ({
      taskId: 'task-exporting',
      status: TaskExecuteStatus.Finished,
      lot: 'lot-exporting',
      dataCount: 12
    }),
    createAsyncCloudStorageExport: async () => {},
    getLastExportPreview: async () => ({
      latestExportFileStatus: AsyncExportFileStatus.WaitingGenerate,
      latestExportFileUrl: 'https://download.example.com/task-exporting.csv',
      exportProgressPercent: 65,
      collectedDataTotal: 12,
      collectedDataSample: []
    })
  };

  const result = await exportDataTool.handler(
    {
      taskId: 'task-exporting',
      exportFileType: 'CSV'
    },
    api
  );

  assert.equal(result.success, true);
  assert.equal(result.status, 'exporting');
  assert.equal(result.retryGuidance.tool, 'export_data');
  assert.equal(result.retryGuidance.waitSecondsMin, 10);
  assert.equal(result.retryGuidance.waitSecondsMax, 30);
  assert.match(result.retryGuidance.instruction, /10-30 seconds/i);
  assert.match(result.message, /still being generated/i);
  assert.match(result.suggestion, /10-30 seconds/i);
});
