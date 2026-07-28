import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CLIENTAPI_BASE_URL = process.env.CLIENTAPI_BASE_URL || 'https://client-api.example.com';
process.env.OFFICIAL_SITE_URL = process.env.OFFICIAL_SITE_URL || 'https://octoparse.example.com';

const messages = (await import('../dist/config/messages.js')).default;
const { startOrStopTaskTool, searchTasksTool } = await import('../dist/tools/task-tools.js');
const workflowToolsModule = await import('../dist/tools/workflow-tools.js');
const {
  searchTemplateTool,
  executeTaskTool
} = workflowToolsModule;
const { exportDataTool } = await import('../dist/tools/export-data-tool.js');
const { redeemCouponCodeTool } = await import('../dist/tools/marketing-tools.js');

test('start_or_stop_task metadata is sourced from the stable messages entry', () => {
  assert.equal(startOrStopTaskTool.title, messages.tools.startOrStopTask.title);
  assert.equal(startOrStopTaskTool.description, messages.tools.startOrStopTask.description);
});

test('remaining tool metadata is sourced from the stable messages entry', () => {
  assert.equal(searchTasksTool.title, messages.tools.searchTasks.title);
  assert.equal(searchTasksTool.description, messages.tools.searchTasks.description);

  assert.equal(searchTemplateTool.title, messages.tools.searchTemplates.title);
  assert.equal(searchTemplateTool.description, messages.tools.searchTemplates.description);

  assert.equal(exportDataTool.title, messages.tools.exportData.title);
  assert.equal(exportDataTool.description, messages.tools.exportData.description);

  assert.equal(executeTaskTool.title, messages.tools.executeTask.title);
  assert.equal(executeTaskTool.description, messages.tools.executeTask.description);

  assert.equal(redeemCouponCodeTool.title, messages.tools.redeemCouponCode.title);
  assert.equal(redeemCouponCodeTool.description, messages.tools.redeemCouponCode.description);
});

test('workflow-tools only exports workflow tools and not the authoritative export_data tool', () => {
  assert.equal('exportDataTool' in workflowToolsModule, false);
});

test('execute_task message metadata reflects task-mode and export follow-up contract', () => {
  assert.match(messages.tools.executeTask.description, /validateOnly/i);
  assert.match(messages.tools.executeTask.description, /accepted/i);
  assert.match(messages.tools.executeTask.description, /MCP Tasks mode/i);
  assert.match(messages.tools.executeTask.description, /tasks\/get/);
  assert.match(messages.tools.executeTask.description, /tasks\/result/);
  assert.match(messages.tools.executeTask.description, /export_data/);
  assert.match(messages.tools.executeTask.description, /targetMaxRows/i);
});

test('execute_task supports MCP tasks optionally so validateOnly can remain a synchronous preflight call', () => {
  assert.equal(executeTaskTool.taskRegistration.execution.taskSupport, 'optional');
  assert.equal(executeTaskTool.plainCallExecution, 'direct');
});
