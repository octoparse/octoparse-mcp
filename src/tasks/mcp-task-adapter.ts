import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TemplateVersionDetail, TemplateView } from '../api/types.js';

export interface PreparedExecutionUserInputParameters {
  UIParameters: Array<{
    Id: string;
    Value?: unknown;
    Customize?: unknown;
    sourceTaskId?: string;
    sourceField?: string;
  }>;
  TemplateParameters: Array<{
    ParamName: string;
    Value?: unknown;
  }>;
}

export interface PreparedExecutionTask {
  templateId: number;
  templateName: string;
  taskName?: string;
  userInputParameters: PreparedExecutionUserInputParameters;
  templateView: TemplateView;
  templateVersionDetail: TemplateVersionDetail;
  parameterKeyMappings: Array<{
    from: string;
    to: string;
  }>;
  ignoredParameterKeys: string[];
  targetMaxRows?: number;
}

interface OctoparseTaskSummary {
  taskId?: string;
  status?: string;
  extractedCount?: number | null;
}

function buildNextStep(taskId?: string) {
  if (!taskId) {
    return undefined;
  }

  return {
    tool: 'export_data' as const,
    args: {
      taskId
    }
  };
}

function buildOctoparseTaskSummary(input: OctoparseTaskSummary) {
  return {
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.extractedCount !== undefined ? { extractedCount: input.extractedCount } : {})
  };
}

function buildExecutionModeMetadata() {
  return {
    preferredExecutionMode: 'task' as const,
    actualExecutionMode: 'task' as const,
    followupProtocol: 'tasks/get -> tasks/result -> export_data' as const
  };
}

export function buildExecutionTaskSuccessResult(input: {
  templateName: string;
  octoparseTaskId: string;
  completionReason: 'natural_finish' | 'quota_stop';
  message: string;
  rawStatus?: string;
  extractedCount?: number | null;
}): CallToolResult {
  const nextStep = buildNextStep(input.octoparseTaskId);

  return {
    content: [
      {
        type: 'text',
        text: input.message
      }
    ],
    structuredContent: {
      success: true,
      status: 'completed',
      templateName: input.templateName,
      ...buildExecutionModeMetadata(),
      completionReason: input.completionReason,
      octoparseTask: buildOctoparseTaskSummary({
        taskId: input.octoparseTaskId,
        status: input.rawStatus,
        extractedCount: input.extractedCount
      }),
      ...(nextStep ? { nextStep } : {})
    }
  };
}

export function buildExecutionTaskFailureResult(input: {
  templateName: string;
  error: string;
  message: string;
  octoparseTaskId?: string;
  rawStatus?: string;
  extractedCount?: number | null;
  status?: 'failed' | 'timeout';
}): CallToolResult {
  const nextStep = buildNextStep(input.octoparseTaskId);

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: input.message
      }
    ],
    structuredContent: {
      success: false,
      status: input.status ?? 'failed',
      templateName: input.templateName,
      ...buildExecutionModeMetadata(),
      error: input.error,
      ...(input.octoparseTaskId || input.rawStatus || input.extractedCount !== undefined
        ? {
            octoparseTask: buildOctoparseTaskSummary({
              taskId: input.octoparseTaskId,
              status: input.rawStatus,
              extractedCount: input.extractedCount
            })
          }
        : {}),
      ...(nextStep ? { nextStep } : {})
    }
  };
}

export function buildExecutionTaskCancelledResult(input: {
  templateName: string;
  message: string;
  octoparseTaskId?: string;
  rawStatus?: string;
  extractedCount?: number | null;
}): CallToolResult {
  const nextStep = buildNextStep(input.octoparseTaskId);

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: input.message
      }
    ],
    structuredContent: {
      success: false,
      status: 'cancelled',
      templateName: input.templateName,
      ...buildExecutionModeMetadata(),
      error: 'task_cancelled',
      ...(input.octoparseTaskId || input.rawStatus || input.extractedCount !== undefined
        ? {
            octoparseTask: buildOctoparseTaskSummary({
              taskId: input.octoparseTaskId,
              status: input.rawStatus,
              extractedCount: input.extractedCount
            })
          }
        : {}),
      ...(nextStep ? { nextStep } : {})
    }
  };
}

export function buildExecutionTaskInputRequiredResult(input: {
  templateName: string;
  error: 'credential_handle_expired' | 'credential_handle_not_found';
  message: string;
}): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: input.message
      }
    ],
    structuredContent: {
      success: false,
      status: 'input_required',
      templateName: input.templateName,
      ...buildExecutionModeMetadata(),
      error: input.error
    }
  };
}
