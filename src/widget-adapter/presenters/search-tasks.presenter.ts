import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import messages from '../../config/messages.js';
import { createOpenAiWidgetToolResult } from '../ui-result.js';
import type { ToolUiBinding } from '../tool-ui-contract.js';

interface TaskRow {
  taskId?: string;
  taskName?: string;
  rawTaskStatusCode?: number;
  taskStatusLabel?: string;
  taskDescription?: string | null;
  author?: string | null;
  creationUserName?: string | null;
  version?: string | null;
}

interface SearchTasksLikeResult {
  success?: boolean;
  error?: string;
  message?: string;
  page?: number;
  size?: number;
  total?: number;
  currentTotal?: number;
  totalPages?: number;
  hasMore?: boolean;
  filtersApplied?: Record<string, unknown>;
  tasks?: TaskRow[];
}

function statusTone(label: string | undefined): 'running' | 'stopped' | 'completed' | 'failed' | 'unknown' {
  switch ((label || '').toLowerCase()) {
    case 'running':
      return 'running';
    case 'stopped':
      return 'stopped';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'unknown';
  }
}

export function presentSearchTasksResult(
  result: SearchTasksLikeResult,
  binding: Pick<ToolUiBinding, 'resourceUri' | 'outputTemplate' | 'widgetAccessible'>
): CallToolResult {
  const rows = (result.tasks ?? []).map((task) => ({
    taskId: task.taskId ?? '',
    taskName: task.taskName ?? '',
    taskStatusLabel: task.taskStatusLabel ?? 'Unknown',
    rawTaskStatusCode: task.rawTaskStatusCode ?? null,
    taskDescription: task.taskDescription ?? '',
    author: task.author ?? '',
    creationUserName: task.creationUserName ?? '',
    version: task.version ?? '',
    statusTone: statusTone(task.taskStatusLabel)
  }));

  const summary = result.success === false
    ? result.message || 'Task search failed.'
    : rows.length > 0
      ? `UI already shows the task rows. Found ${rows.length} task result${rows.length === 1 ? '' : 's'}.`
      : 'UI already shows the task rows. No task results matched the current filters.';

  return createOpenAiWidgetToolResult({
    binding,
    text: summary,
    structuredContent: {
      success: result.success !== false,
      page: result.page ?? 1,
      size: result.size ?? rows.length,
      total: result.total ?? rows.length,
      currentTotal: result.currentTotal ?? rows.length,
      totalPages: result.totalPages ?? 1,
      hasMore: result.hasMore ?? false,
      filtersApplied: result.filtersApplied ?? {},
      tasks: rows.map((row) => ({
        taskId: row.taskId,
        taskName: row.taskName,
        taskStatusLabel: row.taskStatusLabel,
        rawTaskStatusCode: row.rawTaskStatusCode
      })),
      ...(result.success === false && result.error ? { error: result.error } : {})
    },
    widgetData: {
      widgetType: 'search-tasks',
      rows,
      startTaskPromptTemplate: messages.tools.searchTasks.actionPromptTemplates.start,
      stopTaskPromptTemplate: messages.tools.searchTasks.actionPromptTemplates.stop,
      pagination: {
        page: result.page ?? 1,
        size: result.size ?? rows.length,
        total: result.total ?? rows.length,
        totalPages: result.totalPages ?? 1
      },
      filtersApplied: result.filtersApplied ?? {}
    },
    isError: result.success === false
  });
}
