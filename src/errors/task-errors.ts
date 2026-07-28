import { OctoparseApiError } from '../api/types.js';
import { AppConfig } from '../config/app-config.js';
import { getMessageByKey } from './error-renderer.js';

export const REACH_TRIAL_TEMPLATE_TASK_COLLECT_LIMIT_ERROR =
  'ReachTrailTemplateTaskCollectLimit';
export const START_TASK_NO_PERMISSION_ERROR = 'nopermission';
export const START_TASK_NO_PERMISSION_MESSAGE =
  getMessageByKey('errors.task.start.noPermission') ||
  'You do not have permission to start this task. Only template tasks can use the trial quota. Please upgrade to Team or Enterprise.';

function normalizeStartTaskErrorCode(code: unknown): string | undefined {
  if (typeof code !== 'string') {
    return undefined;
  }

  const trimmed = code.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

export function getStartTaskMessageByCode(code: unknown): string | undefined {
  const normalizedCode = normalizeStartTaskErrorCode(code);
  if (!normalizedCode) {
    return undefined;
  }

  if (normalizedCode === START_TASK_NO_PERMISSION_ERROR) {
    return START_TASK_NO_PERMISSION_MESSAGE;
  }

  return undefined;
}

export function getStartTaskErrorMessage(
  error: unknown,
  fallback: string = 'Start failed'
): string {
  const codeMessage = getStartTaskMessageByCode(
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  );
  if (codeMessage) {
    return codeMessage;
  }

  const rawMessage =
    typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : undefined;
  if (typeof rawMessage === 'string' && rawMessage.trim()) {
    return rawMessage.trim();
  }

  return fallback;
}

export function isTrialTemplateTaskCollectLimitError(
  error: unknown
): error is OctoparseApiError {
  return (
    error instanceof OctoparseApiError &&
    error.code === REACH_TRIAL_TEMPLATE_TASK_COLLECT_LIMIT_ERROR &&
    error.statusCode === 400
  );
}

export function getPlanUpgradeUrl(): string {
  return AppConfig.getApiConfig().upgradeUrl;
}

export function getTrialTemplateCollectLimitUpgradeMessage(): string {
  return 'The current account has reached the cloud collection limit for this trial template. Please upgrade to a higher plan before starting the task again.';
}
