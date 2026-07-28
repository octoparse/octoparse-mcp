import { AuthManager } from '../api/auth.js';
import { OctoparseApi } from '../api/octoparse.js';
import { StartTaskResult } from '../api/types.js';
import type { Result, Task } from '@modelcontextprotocol/sdk/types.js';
import type { UserInfo } from '../auth.js';
import { StaticTokenProvider } from '../auth/token-provider.js';
import {
  ExecutionTaskAuthHandleError,
  type ExecutionTaskAuthStore
} from './execution-task-auth.js';
import {
  buildExecutionTaskCancelledResult,
  buildExecutionTaskFailureResult,
  buildExecutionTaskInputRequiredResult,
  buildExecutionTaskSuccessResult,
  type PreparedExecutionTask
} from './mcp-task-adapter.js';

function resolveExecuteTaskPollMaxMs(): number {
  const raw = process.env.EXECUTE_TASK_POLL_MAX_MINUTES;
  if (raw !== undefined && raw.trim() !== '') {
    const minutes = Number(raw);
    if (Number.isFinite(minutes) && minutes > 0 && minutes <= 24 * 60) {
      return Math.floor(minutes * 60 * 1000);
    }
  }

  return 10 * 60 * 1000;
}

function coalesceExtractCount(value: number | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return null;
  }

  return Math.floor(normalized);
}

function mapProgressToWorkflowStatus(
  status: string | undefined
): 'executing' | 'completed' | 'failed' | null {
  if (!status) {
    return null;
  }

  switch (status) {
    case 'Unexecuted':
    case 'Waiting':
    case 'Executing':
    case 'Stopping':
      return 'executing';
    case 'Finished':
      return 'completed';
    case 'Stopped':
      return 'failed';
    default:
      return 'executing';
  }
}

export interface ExecutionTaskRequestStore {
  getTask(taskId: string): Promise<Task>;
  storeTaskResult(
    taskId: string,
    status: 'completed' | 'failed',
    result: Result
  ): Promise<void>;
  updateTaskStatus(taskId: string, status: Task['status'], statusMessage?: string): Promise<void>;
}

export interface ExecutionTaskWorkerJob {
  taskId: string;
  taskStore: ExecutionTaskRequestStore;
  credentialHandleId: string;
  credentialOwner: {
    sessionId?: string;
    userId?: string;
  };
  preparedExecution: PreparedExecutionTask;
}

export interface ExecutionTaskWorkerOptions {
  authStore: ExecutionTaskAuthStore;
  createApi?: (resolvedCredential: {
    authType: 'jwt' | 'apikey';
    token?: string;
    apiKey?: string;
    userId?: string;
    username?: string;
  }) => Pick<
    OctoparseApi,
    'createTemplateTask' | 'startTask' | 'getTaskStatus' | 'stopTask'
  >;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  pollIntervalWithTargetMaxRowsMs?: number;
  pollMaxMs?: number;
  lockTtlMs?: number;
}

export class ExecutionTaskWorker {
  private readonly authStore: ExecutionTaskAuthStore;
  private readonly createApi: NonNullable<ExecutionTaskWorkerOptions['createApi']>;
  private readonly sleep: NonNullable<ExecutionTaskWorkerOptions['sleep']>;
  private readonly pollIntervalMs: number;
  private readonly pollIntervalWithTargetMaxRowsMs: number;
  private readonly pollMaxMs: number;
  private readonly lockTtlMs: number;
  private readonly runningTaskLocks = new Map<string, number>();

  constructor(options: ExecutionTaskWorkerOptions) {
    this.authStore = options.authStore;
    this.createApi =
      options.createApi ??
      ((resolvedCredential) => {
        const credential = resolvedCredential.apiKey ?? resolvedCredential.token ?? null;
        const userInfo: UserInfo | null = resolvedCredential.userId
          ? {
              id: resolvedCredential.userId,
              ...(resolvedCredential.username ? { username: resolvedCredential.username } : {})
            }
          : null;
        const tokenProvider = new StaticTokenProvider(
          credential,
          userInfo,
          resolvedCredential.authType === 'apikey'
        );

        return new OctoparseApi(new AuthManager(tokenProvider));
      });
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.pollIntervalMs = options.pollIntervalMs ?? 2_500;
    this.pollIntervalWithTargetMaxRowsMs = options.pollIntervalWithTargetMaxRowsMs ?? 1_500;
    this.pollMaxMs = options.pollMaxMs ?? resolveExecuteTaskPollMaxMs();
    this.lockTtlMs = options.lockTtlMs ?? 5 * 60 * 1000;
  }

  async run(job: ExecutionTaskWorkerJob): Promise<void> {
    if (!this.acquireTaskLock(job.taskId)) {
      return;
    }

    let octoparseTaskId: string | undefined;
    let api:
      | Pick<OctoparseApi, 'createTemplateTask' | 'startTask' | 'getTaskStatus' | 'stopTask'>
      | undefined;

    try {
      await job.taskStore.updateTaskStatus(job.taskId, 'working', 'Creating Octoparse task');

      const resolvedCredential = this.authStore.resolveHandle(
        job.credentialHandleId,
        job.credentialOwner
      );
      api = this.createApi(resolvedCredential);
      const preparedExecution = job.preparedExecution;

      if (await this.finalizeIfCancelled(job, preparedExecution.templateName, api, octoparseTaskId)) {
        return;
      }

      const created = await api.createTemplateTask(
        preparedExecution.templateId,
        preparedExecution.taskName,
        undefined,
        preparedExecution.userInputParameters,
        undefined,
        undefined,
        {
          templateDetail: preparedExecution.templateView,
          templateVersionDetail: preparedExecution.templateVersionDetail
        }
      );
      octoparseTaskId = created.taskId;

      if (await this.finalizeIfCancelled(job, preparedExecution.templateName, api, octoparseTaskId)) {
        return;
      }

      await job.taskStore.updateTaskStatus(job.taskId, 'working', 'Starting Octoparse cloud task');

      const startResult = await api.startTask(octoparseTaskId);
      if (
        startResult.result !== StartTaskResult.SUCCESS &&
        startResult.result !== StartTaskResult.ALREADY_RUNNING
      ) {
        const message =
          startResult.message ??
          `Cloud start failed with result ${String(startResult.result)}.`;
        await this.storeFailureResult(job, {
          templateName: preparedExecution.templateName,
          error: 'cloud_start_failed',
          message,
          octoparseTaskId
        });
        return;
      }

      const pollSleepMs =
        preparedExecution.targetMaxRows !== undefined
          ? this.pollIntervalWithTargetMaxRowsMs
          : this.pollIntervalMs;
      const pollDeadline = Date.now() + this.pollMaxMs;
      let quotaStopRequested = false;

      await job.taskStore.updateTaskStatus(job.taskId, 'working', 'Polling Octoparse task status');

      while (Date.now() < pollDeadline) {
        if (await this.finalizeIfCancelled(job, preparedExecution.templateName, api, octoparseTaskId)) {
          return;
        }

        const statuses = await api.getTaskStatus([octoparseTaskId]);
        const row = statuses.find((status) => status.taskId === octoparseTaskId) ?? statuses[0];
        if (!row) {
          await this.sleep(pollSleepMs);
          continue;
        }

        const extractedCount = coalesceExtractCount(row.currentTotalExtractCount);
        const mappedStatus = mapProgressToWorkflowStatus(row.status);

        if (
          preparedExecution.targetMaxRows !== undefined &&
          mappedStatus === 'executing' &&
          !quotaStopRequested &&
          extractedCount !== null &&
          extractedCount >= preparedExecution.targetMaxRows
        ) {
          quotaStopRequested = true;
          try {
            await api.stopTask(octoparseTaskId);
          } catch {
            // stopTask is best-effort for targetMaxRows follow-up
          }
        }

        if (mappedStatus === 'completed') {
          await job.taskStore.storeTaskResult(
            job.taskId,
            'completed',
            buildExecutionTaskSuccessResult({
              templateName: preparedExecution.templateName,
              octoparseTaskId,
              completionReason: 'natural_finish',
              rawStatus: row.status,
              extractedCount,
              message: `Task completed. Continue with export_data(taskId="${octoparseTaskId}").`
            })
          );
          return;
        }

        if (mappedStatus === 'failed' && row.status === 'Stopped' && quotaStopRequested) {
          await job.taskStore.storeTaskResult(
            job.taskId,
            'completed',
            buildExecutionTaskSuccessResult({
              templateName: preparedExecution.templateName,
              octoparseTaskId,
              completionReason: 'quota_stop',
              rawStatus: row.status,
              extractedCount,
              message: `targetMaxRows was reached. A best-effort stop request was sent, and you can continue with export_data(taskId="${octoparseTaskId}").`
            })
          );
          return;
        }

        if (mappedStatus === 'failed') {
          await this.storeFailureResult(job, {
            templateName: preparedExecution.templateName,
            error: 'task_execution_failed',
            message: `Task stopped before successful completion (status: ${row.status ?? 'unknown'}).`,
            octoparseTaskId,
            rawStatus: row.status,
            extractedCount
          });
          return;
        }

        await this.sleep(pollSleepMs);
      }

      await this.storeFailureResult(job, {
        templateName: job.preparedExecution.templateName,
        error: 'task_poll_timeout',
        status: 'timeout',
        message: `Stopped polling after ${this.pollMaxMs / 60000} minute(s). Continue with export_data(taskId="${octoparseTaskId ?? ''}").`,
        octoparseTaskId
      });
    } catch (error) {
      if (error instanceof ExecutionTaskAuthHandleError) {
        if (
          error.code === 'credential_handle_expired' ||
          error.code === 'credential_handle_not_found'
        ) {
          await job.taskStore.updateTaskStatus(
            job.taskId,
            'input_required',
            'Background execution needs fresh authentication credentials.'
          );
          await job.taskStore.storeTaskResult(
            job.taskId,
            'failed',
            buildExecutionTaskInputRequiredResult({
              templateName: job.preparedExecution.templateName,
              error: error.code,
              message:
                'Background execution needs fresh authentication credentials. Please re-authenticate and create a new execute_task run.'
            })
          );
          return;
        }
      }

      await this.storeFailureResult(job, {
        templateName: job.preparedExecution.templateName,
        error: octoparseTaskId ? 'cloud_start_failed' : 'task_creation_failed',
        message:
          octoparseTaskId
            ? `Cloud start failed: ${error instanceof Error ? error.message : 'unknown_error'}.`
            : error instanceof Error
              ? error.message
              : 'Task execution failed.',
        octoparseTaskId
      });
    } finally {
      this.releaseTaskLock(job.taskId);
      this.authStore.deleteHandle(job.credentialHandleId);
    }
  }

  private async storeFailureResult(
    job: ExecutionTaskWorkerJob,
    input: Parameters<typeof buildExecutionTaskFailureResult>[0]
  ): Promise<void> {
    await job.taskStore.updateTaskStatus(job.taskId, 'failed', input.message);
    await job.taskStore.storeTaskResult(
      job.taskId,
      'failed',
      buildExecutionTaskFailureResult(input)
    );
  }

  private async finalizeIfCancelled(
    job: ExecutionTaskWorkerJob,
    templateName: string,
    api:
      | Pick<OctoparseApi, 'createTemplateTask' | 'startTask' | 'getTaskStatus' | 'stopTask'>
      | undefined,
    octoparseTaskId?: string
  ): Promise<boolean> {
    const currentTask = await job.taskStore.getTask(job.taskId);
    if (currentTask.status !== 'cancelled') {
      return false;
    }

    if (api && octoparseTaskId) {
      try {
        await api.stopTask(octoparseTaskId);
      } catch {
        // Cancellation should remain best-effort if upstream stop fails.
      }
    }

    await job.taskStore.storeTaskResult(
      job.taskId,
      'failed',
      buildExecutionTaskCancelledResult({
        templateName,
        message: currentTask.statusMessage
          ? `Task cancelled: ${currentTask.statusMessage}`
          : 'Task was cancelled before Octoparse execution finished.',
        octoparseTaskId
      })
    );
    return true;
  }

  private acquireTaskLock(taskId: string): boolean {
    const now = Date.now();
    const existingExpiry = this.runningTaskLocks.get(taskId);
    if (existingExpiry && existingExpiry > now) {
      return false;
    }

    this.runningTaskLocks.set(taskId, now + this.lockTtlMs);
    return true;
  }

  private releaseTaskLock(taskId: string): void {
    this.runningTaskLocks.delete(taskId);
  }
}
