import { z } from 'zod';
import { OctoparseApi } from '../api/octoparse.js';
import { StartTaskResult } from '../api/types.js';
import messages from '../config/messages.js';
import {
  getStartTaskErrorMessage,
  getPlanUpgradeUrl,
  getTrialTemplateCollectLimitUpgradeMessage,
  isTrialTemplateTaskCollectLimitError
} from '../errors/task-errors.js';
import { presentSearchTasksResult } from '../widget-adapter/presenters/search-tasks.presenter.js';
import { SEARCH_TASKS_WIDGET_URI } from '../widget-adapter/resource-registry.js';
import { InputValidator } from '../security/input-validator.js';
import { EnumLabelUtil } from '../utils/enum-mapper.js';
import { ToolDefinition } from './tool-definition.js';

async function resolveApiInstance(
  apiOrFactory: OctoparseApi | (() => Promise<OctoparseApi | undefined>) | undefined
): Promise<OctoparseApi | undefined> {
  if (typeof apiOrFactory === 'function') {
    return apiOrFactory();
  }
  return apiOrFactory;
}

interface TaskToolError {
  success: false;
  error: string;
  message: string;
  recoverable?: boolean;
  requiresUserAction?: boolean;
  [key: string]: unknown;
}

function buildTaskToolError(
  error: string,
  message: string,
  extra: Record<string, unknown> = {}
): TaskToolError {
  return {
    success: false,
    error,
    message,
    ...extra
  };
}

function isTaskActivelyRunning(status?: string): boolean {
  return status === 'Waiting' || status === 'Executing' || status === 'Stopping';
}

async function getTaskStatusRow(
  api: OctoparseApi,
  taskId: string
): Promise<{ status?: string; currentTotalExtractCount?: number | null } | undefined> {
  try {
    const statuses = await api.getTaskStatus([taskId]);
    return statuses.find((task) => task.taskId === taskId) ?? statuses[0];
  } catch {
    return undefined;
  }
}

function getStartTaskResultDescription(result: number | undefined): string {
  switch (result) {
    case StartTaskResult.SUCCESS:
      return 'Task started successfully';
    case StartTaskResult.ALREADY_RUNNING:
      return 'Task is already running';
    case StartTaskResult.TASK_NOT_FOUND:
      return 'Task not found';
    case StartTaskResult.INSUFFICIENT_CREDITS:
    case StartTaskResult.USER_CREDIT_INSUFFICIENT:
      return 'Insufficient credits';
    case StartTaskResult.TASK_DISABLED:
      return 'Task disabled or template not runnable on cloud';
    case StartTaskResult.RATE_LIMIT_EXCEEDED:
      return 'Rate limit exceeded';
    case StartTaskResult.USER_INSUFFICIENT_PERMISSION:
      return 'Insufficient permissions';
    default:
      return 'Unknown start result';
  }
}

const startOrStopTaskInputSchema = z.object({
  taskId: InputValidator.createTaskIdSchema().describe(
    'Existing Octoparse task id to control.'
  ),
  action: z
    .enum(['start', 'stop'])
    .describe('Required. Use "start" to start the task, or "stop" to stop it.')
});

export const startOrStopTaskTool: ToolDefinition = {
  name: 'start_or_stop_task',
  title: messages.tools.startOrStopTask.title,
  description: messages.tools.startOrStopTask.description,
  requiresAuth: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  inputSchema: startOrStopTaskInputSchema,
  handler: async (input, apiOrFactory) => {
    const api = await resolveApiInstance(apiOrFactory);
    if (!api) {
      throw new Error('API instance required');
    }

    const statusRow = await getTaskStatusRow(api, input.taskId);
    const currentStatus = statusRow?.status;

    if (input.action === 'stop') {
      if (currentStatus && !isTaskActivelyRunning(currentStatus)) {
        return {
          success: true,
          taskId: input.taskId,
          action: input.action,
          status: 'already_stopped' as const,
          currentStatus,
          message: `Task is not running${currentStatus ? ` (current status: ${currentStatus})` : ''}.`
        };
      }

      try {
        await api.stopTask(input.taskId);
      } catch (e) {
        return buildTaskToolError(
          'task_stop_failed',
          e instanceof Error ? e.message : 'Stop failed',
          {
            recoverable: true,
            taskId: input.taskId,
            action: input.action,
            currentStatus
          }
        );
      }

      return {
        success: true,
        taskId: input.taskId,
        action: input.action,
        status: 'stop_requested' as const,
        ...(currentStatus ? { previousStatus: currentStatus } : {}),
        message: 'Stop request accepted.'
      };
    }

    if (currentStatus && isTaskActivelyRunning(currentStatus)) {
      return {
        success: true,
        taskId: input.taskId,
        action: input.action,
        status: 'already_running' as const,
        currentStatus,
        message: `Task is already running${currentStatus ? ` (current status: ${currentStatus})` : ''}.`
      };
    }

    let startResult;
    try {
      startResult = await api.startTask(input.taskId);
    } catch (e) {
      if (isTrialTemplateTaskCollectLimitError(e)) {
        return buildTaskToolError(
          'plan_upgrade_required',
          getTrialTemplateCollectLimitUpgradeMessage(),
          {
            recoverable: false,
            requiresUserAction: true,
            taskId: input.taskId,
            action: input.action,
            currentStatus,
            upgradeUrl: getPlanUpgradeUrl(),
            upstreamErrorCode: e.code
          }
        );
      }

      return buildTaskToolError(
        'task_start_failed',
        getStartTaskErrorMessage(e),
        {
          recoverable: true,
          taskId: input.taskId,
          action: input.action,
          currentStatus
        }
      );
    }

    switch (startResult.result) {
      case StartTaskResult.SUCCESS:
        return {
          success: true,
          taskId: input.taskId,
          action: input.action,
          status: 'start_requested' as const,
          ...(currentStatus ? { previousStatus: currentStatus } : {}),
          ...(startResult.lotNo ? { lot: startResult.lotNo } : {}),
          message: 'Start request accepted.'
        };
      case StartTaskResult.ALREADY_RUNNING:
        return {
          success: true,
          taskId: input.taskId,
          action: input.action,
          status: 'already_running' as const,
          currentStatus: currentStatus ?? 'Executing',
          message: 'Task is already running.'
        };
      case StartTaskResult.TASK_NOT_FOUND:
        return buildTaskToolError('task_not_found', startResult.message || 'Task not found.', {
          recoverable: false,
          taskId: input.taskId,
          action: input.action
        });
      case StartTaskResult.INSUFFICIENT_CREDITS:
      case StartTaskResult.USER_CREDIT_INSUFFICIENT:
        return buildTaskToolError('insufficient_credits', startResult.message || 'Insufficient credits to start this task.', {
          recoverable: false,
          requiresUserAction: true,
          taskId: input.taskId,
          action: input.action
        });
      case StartTaskResult.TASK_DISABLED:
        return buildTaskToolError('task_disabled', startResult.message || 'Task is disabled or cannot run on cloud.', {
          recoverable: false,
          taskId: input.taskId,
          action: input.action
        });
      case StartTaskResult.RATE_LIMIT_EXCEEDED:
        return buildTaskToolError('rate_limit_exceeded', startResult.message || 'Too many concurrent cloud tasks. Retry later.', {
          recoverable: true,
          taskId: input.taskId,
          action: input.action
        });
      case StartTaskResult.USER_INSUFFICIENT_PERMISSION:
        return buildTaskToolError('insufficient_permission', startResult.message || 'Current account does not have permission to start this task.', {
          recoverable: false,
          requiresUserAction: true,
          taskId: input.taskId,
          action: input.action
        });
      default:
        return buildTaskToolError(
          'task_start_rejected',
          getStartTaskResultDescription(startResult.result),
          {
            recoverable: false,
            taskId: input.taskId,
            action: input.action,
            startResultCode: startResult.result,
            upstreamMessage: startResult.message,
            startResultLabel: EnumLabelUtil.startTaskResult(startResult.result)
          }
        );
    }
  }
};

const searchTasksInputSchema = z.object({
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe('Optional. 1-based page number. Default is 1.'),
  size: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .describe('Optional. Page size. Default is 10.'),
  keyword: InputValidator.createSearchQuerySchema()
    .optional()
    .describe('Optional. Search string for task name or related task text.'),
  status: z
    .enum(['Running', 'Stopped', 'Completed', 'Failed'])
    .optional()
    .describe('Optional. Filter by task status.'),
  taskIds: z
    .array(InputValidator.createTaskIdSchema())
    .max(100)
    .optional()
    .describe('Optional. Explicit task ids to fetch.')
});

export const searchTasksTool: ToolDefinition = {
  name: 'search_tasks',
  title: messages.tools.searchTasks.title,
  description: messages.tools.searchTasks.description,
  requiresAuth: true,
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: false },
  uiBinding: {
    resourceUri: SEARCH_TASKS_WIDGET_URI,
    widgetTitle: 'Task Search Results',
    widgetDescription: 'Visual task rows for OpenAI Apps SDK.',
    invokingText: 'Searching Octoparse tasks...',
    invokedText: 'Task search results are ready.',
    presenter: (result) =>
      presentSearchTasksResult(result as Record<string, unknown>, {
        resourceUri: SEARCH_TASKS_WIDGET_URI
      })
  },
  inputSchema: searchTasksInputSchema,
  handler: async (input, apiOrFactory) => {
    const api = await resolveApiInstance(apiOrFactory);
    if (!api) {
      throw new Error('API instance required');
    }

    const response = await api.searchTaskList({
      pageIndex: input.page,
      pageSize: input.size,
      ...(input.keyword ? { keyWord: input.keyword } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.taskIds && input.taskIds.length > 0 ? { taskIds: input.taskIds } : {})
    });

    const tasks = (response.dataList ?? []).map((task) => ({
      taskId: task.taskId ?? '',
      taskName: task.taskName ?? '',
      rawTaskStatusCode: task.taskExecuteStatus ?? (task as { taskStatus?: number }).taskStatus,
      taskStatusLabel: EnumLabelUtil.taskRuleExecuteStatus(task.taskExecuteStatus),
      taskDescription: task.taskDescription ?? '',
      author: task.author ?? '',
      creationUserName: task.creationUserName ?? '',
      version: task.version ?? ''
    }));

    const total = response.total ?? tasks.length;
    const page = response.pageIndex ?? input.page;
    const size = response.pageSize ?? input.size;
    const currentTotal = response.currentTotal ?? tasks.length;
    const totalPages = Math.max(1, Math.ceil(total / Math.max(size, 1)));

    return {
      success: true,
      page,
      size,
      total,
      currentTotal,
      totalPages,
      hasMore: page < totalPages,
      filtersApplied: {
        ...(input.keyword ? { keyword: input.keyword } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.taskIds && input.taskIds.length > 0 ? { taskIds: input.taskIds } : {})
      },
      tasks
    };
  }
};

export const allTools: ToolDefinition[] = [searchTasksTool, startOrStopTaskTool];
