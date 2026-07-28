/**
 * Self-Correction Error Message Builder
 *
 * This module provides standardized error messages designed to be read by LLMs.
 * Each error message includes:
 * - Root cause explanation
 * - User-friendly explanation template
 * - Specific recovery steps
 * - Things to avoid
 *
 * The goal is to enable LLMs to automatically recover from errors
 * without requiring user intervention.
 */

import { AppConfig } from '../config/app-config.js';
import { SelfCorrectionError, ErrorType } from '../types/errors.js';
import { EnumLabelUtil } from '../utils/enum-mapper.js';
import { getMessageByKey } from './error-renderer.js';

function getSelfCorrectionMessage(key: string, fallback: string): string {
  return getMessageByKey(key) || fallback;
}

function formatMessageTemplate(
  template: string,
  variables: Record<string, string | number | undefined>
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = variables[key];
    return value === undefined ? '' : String(value);
  });
}

function joinLines(...segments: string[]): string {
  return segments.join('\n');
}

function renderSelfCorrectionTemplate(
  key: string,
  fallbackTemplate: string,
  variables: Record<string, string | number | undefined>
): string {
  return formatMessageTemplate(getMessageByKey(key) || fallbackTemplate, variables);
}

function stringifyCompact(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

function stringifyPretty(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  const serialized = JSON.stringify(value, null, 2);
  return serialized === undefined ? String(value) : serialized;
}

function getAccountLevelName(level: number | undefined): string {
  if (level === undefined) {
    return 'Unknown';
  }
  return EnumLabelUtil.accountLevel(level);
}

function extractWebsiteFromTemplateName(templateName: string): string {
  const words = templateName.split(' ');
  return words[0] || templateName;
}

function buildTaskNameSuffix(taskName?: string): string {
  return taskName ? ` ("${taskName}")` : '';
}

function buildTaskNameDetail(taskName?: string): string {
  return taskName ? `- Task Name: ${taskName}` : '';
}

function buildGenericText(
  templateKey: string,
  fallbackTemplate: string,
  variables: Record<string, string | number | undefined>
): { type: 'text'; text: string } {
  return {
    type: 'text',
    text: renderSelfCorrectionTemplate(templateKey, fallbackTemplate, variables)
  };
}

export class SelfCorrectionErrorBuilder {
  static templateLocalOnly(params: {
    taskId: string;
    templateId: number;
    templateName: string;
    accountLimit?: number;
  }): SelfCorrectionError {
    const title = getSelfCorrectionMessage(
      'errors.selfCorrection.templateLocalOnly.title',
      'Error: Cannot start task on cloud.'
    );
    const taskLabel = getSelfCorrectionMessage(
      'errors.selfCorrection.templateLocalOnly.body.taskLabel',
      '[Task]:'
    );
    const rootCause = formatMessageTemplate(
      getSelfCorrectionMessage(
        'errors.selfCorrection.templateLocalOnly.body.rootCause',
        'This task uses template ID {templateId} ("{templateName}"), which has runOn=1 (Local Only).'
      ),
      {
        templateId: params.templateId,
        templateName: params.templateName
      }
    );
    const executionConstraint = getSelfCorrectionMessage(
      'errors.selfCorrection.templateLocalOnly.body.executionConstraint',
      "Templates with runOn=1 can only execute on the user's local computer using the Octoparse desktop application."
    );
    const websiteHint = extractWebsiteFromTemplateName(params.templateName);

    return {
      isError: true,
      isRecoverable: true,
      errorType: ErrorType.TEMPLATE_LOCAL_ONLY,
      metadata: {
        taskId: params.taskId,
        templateId: params.templateId,
        templateName: params.templateName,
        templateRunOn: 1,
        cloudCompatible: false,
        suggestedAction: 'search_templates',
        suggestedParameters: {
          keyword: websiteHint
        },
        filterCriteria: {
          executionMode: 'Cloud'
        }
      },
      content: [
        buildGenericText(
          'errors.selfCorrection.templateLocalOnly.template',
          joinLines(
            '{title}',
            '',
            '{taskLabel}',
            '"{taskId}"',
            '',
            '[Root Cause]:',
            '{rootCause}',
            '{executionConstraint}'
          ),
          {
            title,
            taskLabel,
            taskId: params.taskId,
            rootCause,
            executionConstraint,
            websiteHint,
            templateId: params.templateId,
            templateName: params.templateName,
            accountLimitDetail: params.accountLimit
              ? `- Required Account Level: ${getAccountLevelName(params.accountLimit)}`
              : ''
          }
        )
      ]
    };
  }

  static taskAlreadyRunning(params: {
    taskId: string;
    taskName?: string;
  }): SelfCorrectionError {
    const title = getSelfCorrectionMessage(
      'errors.selfCorrection.taskAlreadyRunning.title',
      'Error: Task is already running.'
    );

    return {
      isError: true,
      isRecoverable: true,
      errorType: ErrorType.TASK_ALREADY_RUNNING,
      metadata: {
        taskId: params.taskId,
        taskName: params.taskName,
        alternativeTools: ['export_data', 'execute_task', 'start_or_stop_task']
      },
      content: [
        buildGenericText(
          'errors.selfCorrection.taskAlreadyRunning.template',
          joinLines('{title}', '', '[Root Cause]:', 'Task "{taskId}"{taskNameSuffix} is currently executing.'),
          {
            title,
            taskId: params.taskId,
            taskNameSuffix: buildTaskNameSuffix(params.taskName),
            taskNameDetail: buildTaskNameDetail(params.taskName)
          }
        )
      ]
    };
  }

  static insufficientCredits(params: {
    taskId?: string;
    currentBalance?: number;
    estimatedCost?: number;
  }): SelfCorrectionError {
    const title = getSelfCorrectionMessage(
      'errors.selfCorrection.insufficientCredits.title',
      'Error: Insufficient credits to start task.'
    );

    return {
      isError: true,
      isRecoverable: false,
      errorType: ErrorType.INSUFFICIENT_CREDITS,
      requiresUserAction: true,
      metadata: {
        taskId: params.taskId,
        currentBalance: params.currentBalance,
        estimatedCost: params.estimatedCost
      },
      content: [
        buildGenericText(
          'errors.selfCorrection.insufficientCredits.template',
          joinLines('{title}', '', '[Root Cause]:', 'The account does not have enough credits.'),
          {
            title,
            taskIdDetail: params.taskId ? `- Task ID: ${params.taskId}` : '',
            currentBalanceLine:
              params.currentBalance !== undefined
                ? `Current balance: ${params.currentBalance} credits`
                : 'Balance information is not available',
            estimatedCostLine:
              params.estimatedCost !== undefined
                ? `Estimated cost: ${params.estimatedCost} credits`
                : '',
            currentBalanceDetail:
              params.currentBalance !== undefined
                ? `- Current Balance: ${params.currentBalance}`
                : '',
            estimatedCostDetail:
              params.estimatedCost !== undefined
                ? `- Estimated Cost: ${params.estimatedCost}`
                : ''
          }
        )
      ]
    };
  }

  static taskNotRunning(params: {
    taskId: string;
    taskName?: string;
    currentStatus?: string;
  }): SelfCorrectionError {
    const title = getSelfCorrectionMessage(
      'errors.selfCorrection.taskNotRunning.title',
      'Error: Task is not currently running.'
    );

    return {
      isError: true,
      isRecoverable: true,
      errorType: ErrorType.TASK_NOT_RUNNING,
      metadata: {
        taskId: params.taskId,
        taskName: params.taskName,
        currentStatus: params.currentStatus,
        alternativeTools: ['start_or_stop_task', 'export_data', 'execute_task', 'search_templates']
      },
      content: [
        buildGenericText(
          'errors.selfCorrection.taskNotRunning.template',
          joinLines('{title}', '', '[Root Cause]:', 'Task "{taskId}"{taskNameSuffix} is not currently executing.'),
          {
            title,
            taskId: params.taskId,
            taskNameSuffix: buildTaskNameSuffix(params.taskName),
            statusLine: params.currentStatus
              ? `Current status: ${params.currentStatus}`
              : 'Status: Not running',
            taskNameDetail: buildTaskNameDetail(params.taskName),
            currentStatusDetail: params.currentStatus
              ? `- Current Status: ${params.currentStatus}`
              : ''
          }
        )
      ]
    };
  }

  static taskNoData(params: {
    taskId: string;
    taskName?: string;
    hasRunBefore: boolean;
  }): SelfCorrectionError {
    const title = getSelfCorrectionMessage(
      'errors.selfCorrection.taskNoData.title',
      'Error: No data available to export.'
    );
    const hasRunBeforeExplanation = params.hasRunBefore
      ? 'The task has been run before, but all collected data has already been exported (incremental export system).'
      : 'The task has not been executed yet, so there is no data to export.';
    const userMessage = params.hasRunBefore
      ? '"This task has already exported all its collected data. To get new data, you need to run the task again."'
      : `"This task hasn't been run yet, so there's no data to export."`;
    const recoverySteps = params.hasRunBefore
      ? `1. Restart this existing task with start_or_stop_task(taskId: "${params.taskId}", action: "start").\n2. Or create a brand-new task with execute_task.\n3. Retry export_data later if you expect new rows.`
      : `1. Run a cloud collection first with execute_task.\n2. After execute_task completes or times out, call export_data with the returned taskId.\n3. If there is still no data, wait briefly and retry.`;

    return {
      isError: true,
      isRecoverable: true,
      errorType: ErrorType.TASK_NO_DATA,
      metadata: {
        taskId: params.taskId,
        taskName: params.taskName,
        hasRunBefore: params.hasRunBefore,
        alternativeTools: params.hasRunBefore
          ? ['start_or_stop_task', 'execute_task', 'export_data']
          : ['execute_task', 'export_data', 'search_templates']
      },
      content: [
        buildGenericText(
          'errors.selfCorrection.taskNoData.template',
          joinLines('{title}', '', '[Root Cause]:', 'Task "{taskId}" has no exportable data.'),
          {
            title,
            taskId: params.taskId,
            taskNameSuffix: buildTaskNameSuffix(params.taskName),
            hasRunBeforeExplanation,
            userMessage,
            recoverySteps,
            taskNameDetail: buildTaskNameDetail(params.taskName),
            hasRunBeforeLabel: params.hasRunBefore ? 'Yes (all data exported)' : 'No (never executed)'
          }
        )
      ]
    };
  }

  static parameterValidationFailed(params: {
    parameterName: string;
    providedValue: any;
    expectedFormat: string;
    example: string;
    tool?: string;
  }): SelfCorrectionError {
    const title = getSelfCorrectionMessage(
      'errors.selfCorrection.parameterValidationFailed.title',
      'Error: Parameter validation failed.'
    );

    return {
      isError: true,
      isRecoverable: true,
      errorType: ErrorType.PARAMETER_VALIDATION_FAILED,
      metadata: {
        parameterName: params.parameterName,
        providedValue: params.providedValue,
        expectedFormat: params.expectedFormat,
        example: params.example,
        tool: params.tool
      },
      content: [
        buildGenericText(
          'errors.selfCorrection.parameterValidationFailed.template',
          joinLines('{title}', '', '[Parameter]:', '"{parameterName}"'),
          {
            title,
            parameterName: params.parameterName,
            toolSuffix: params.tool ? ` in tool "${params.tool}"` : '',
            providedValuePretty: stringifyPretty(params.providedValue),
            expectedFormat: params.expectedFormat,
            example: params.example,
            toolDetail: params.tool ? `- Tool: ${params.tool}` : '',
            providedValueCompact: stringifyCompact(params.providedValue)
          }
        )
      ]
    };
  }

  static cloudTaskPermissionDenied(params: {
    currentAccountLevel: number;
    allowedAccountLevels: number[];
  }): SelfCorrectionError {
    const title = getSelfCorrectionMessage(
      'errors.selfCorrection.cloudTaskPermissionDenied.title',
      'Error: Account does not have permission to run cloud collection tasks.'
    );
    const currentLevelName = getAccountLevelName(params.currentAccountLevel);
    const allowedLevelNames = params.allowedAccountLevels
      .map((level) => getAccountLevelName(level))
      .join(', ');
    const rootCause = formatMessageTemplate(
      getSelfCorrectionMessage(
        'errors.selfCorrection.cloudTaskPermissionDenied.body.rootCause',
        'Your current account level is {currentAccountLevel} ({currentLevelName}), which does not have permission to execute cloud collection tasks.'
      ),
      {
        currentAccountLevel: params.currentAccountLevel,
        currentLevelName
      }
    );
    const requiredLevels = formatMessageTemplate(
      getSelfCorrectionMessage(
        'errors.selfCorrection.cloudTaskPermissionDenied.body.requiredLevels',
        'Cloud task execution requires one of the following account levels: {allowedLevelNames}.'
      ),
      {
        allowedLevelNames
      }
    );
    const { officialSiteUrl, upgradeUrl, downloadUrl } = AppConfig.getApiConfig();
    const trialUrl = `${officialSiteUrl}/console/trial`;

    return {
      isError: true,
      isRecoverable: false,
      errorType: ErrorType.ACCOUNT_LEVEL_INSUFFICIENT,
      requiresUserAction: true,
      metadata: {
        currentAccountLevel: params.currentAccountLevel,
        allowedAccountLevels: params.allowedAccountLevels,
        currentAccountLevelName: currentLevelName,
        allowedAccountLevelNames: params.allowedAccountLevels.map((level) =>
          getAccountLevelName(level)
        ),
        trialUrl,
        upgradeUrl,
        downloadUrl
      },
      content: [
        buildGenericText(
          'errors.selfCorrection.cloudTaskPermissionDenied.template',
          joinLines('{title}', '', '[Root Cause]:', '{rootCause}'),
          {
            title,
            rootCause,
            requiredLevels,
            currentLevelName,
            currentAccountLevel: params.currentAccountLevel,
            allowedAccountLevels: params.allowedAccountLevels.join(', '),
            allowedLevelNames,
            trialUrl,
            upgradeUrl,
            downloadUrl
          }
        )
      ]
    };
  }

  static dataExportFailed(params: {
    taskId: string;
    taskName?: string;
    errorMessage: string;
  }): SelfCorrectionError {
    const title = getSelfCorrectionMessage(
      'errors.selfCorrection.dataExportFailed.title',
      'Error: Failed to export task data via API.'
    );
    const officialSiteUrl = AppConfig.getApiConfig().officialSiteUrl;
    const consoleUrl = `${officialSiteUrl}/console/task/all-data?taskId=${params.taskId}&from=task-list&parentNav=2`;

    return {
      isError: true,
      isRecoverable: false,
      errorType: ErrorType.GENERIC_ERROR,
      requiresUserAction: true,
      metadata: {
        taskId: params.taskId,
        taskName: params.taskName,
        consoleUrl,
        alternativeAction: 'use_web_console'
      },
      content: [
        buildGenericText(
          'errors.selfCorrection.dataExportFailed.template',
          joinLines('{title}', '', '[Root Cause]:', 'Export failed for task "{taskId}".'),
          {
            title,
            taskId: params.taskId,
            taskNameSuffix: buildTaskNameSuffix(params.taskName),
            taskNameDetail: buildTaskNameDetail(params.taskName),
            consoleUrl,
            errorMessage: params.errorMessage
          }
        )
      ]
    };
  }

  static generic(params: {
    operation: string;
    errorMessage: string;
    recoverySuggestion: string;
    isRecoverable?: boolean;
  }): SelfCorrectionError {
    const title = getSelfCorrectionMessage(
      'errors.selfCorrection.generic.title',
      'Error during operation.'
    );

    return {
      isError: true,
      isRecoverable: params.isRecoverable ?? true,
      errorType: ErrorType.GENERIC_ERROR,
      content: [
        buildGenericText(
          'errors.selfCorrection.generic.template',
          joinLines('{title}', '', '[Operation]:', '{operation}'),
          {
            title,
            operation: params.operation,
            errorMessage: params.errorMessage,
            recoverySuggestion: params.recoverySuggestion
          }
        )
      ]
    };
  }
}
