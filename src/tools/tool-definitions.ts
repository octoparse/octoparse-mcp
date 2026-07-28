import { ToolDefinition } from './tool-definition.js';
import {
  allTools as workflowTools,
  executeTaskTool,
  searchTemplateTool
} from './workflow-tools.js';
import { exportDataTool } from './export-data-tool.js';
import {
  allTools as taskTools,
  searchTasksTool,
  startOrStopTaskTool
} from './task-tools.js';
import {
  allTools as marketingTools,
  redeemCouponCodeTool
} from './marketing-tools.js';

/**
 * Single source of truth for the public MCP tool surface.
 * Core scrape flow remains:
 * search_templates -> execute_task -> export_data
 */

export {
  searchTemplateTool,
  executeTaskTool,
  exportDataTool,
  startOrStopTaskTool,
  searchTasksTool,
  redeemCouponCodeTool
};

export const allTools: ToolDefinition[] = [
  ...workflowTools,
  exportDataTool,
  ...taskTools,
  ...marketingTools
];
