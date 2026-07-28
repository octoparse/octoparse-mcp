import type { CallToolResult, CreateTaskResult, GetTaskResult } from '@modelcontextprotocol/sdk/types.js';
import { RequestContextManager } from '../utils/request-context.js';
import type { ExecutionTaskAuthStore } from './execution-task-auth.js';
import type { PreparedExecutionTask } from './mcp-task-adapter.js';
import type {
  ExecutionTaskRequestStore,
  ExecutionTaskWorker,
  ExecutionTaskWorkerJob
} from './execution-task-worker.js';

export interface ExecutionTaskServiceOptions {
  authStore: ExecutionTaskAuthStore;
  worker: Pick<ExecutionTaskWorker, 'run'>;
  credentialHandleTtlMs?: number;
  taskTtlMs?: number | null;
  taskPollIntervalMs?: number;
}

export interface ExecutionTaskServiceCreateInput {
  preparedExecution: PreparedExecutionTask;
  extra: {
    taskStore: ExecutionTaskRequestStore & {
      createTask(taskParams: {
        ttl?: number | null;
        pollInterval?: number;
        context?: Record<string, unknown>;
      }): Promise<CreateTaskResult['task']>;
    };
  };
}

export class ExecutionTaskService {
  private readonly authStore: ExecutionTaskAuthStore;
  private readonly worker: Pick<ExecutionTaskWorker, 'run'>;
  private readonly credentialHandleTtlMs: number;
  private readonly taskTtlMs: number | null;
  private readonly taskPollIntervalMs?: number;

  constructor(options: ExecutionTaskServiceOptions) {
    this.authStore = options.authStore;
    this.worker = options.worker;
    this.credentialHandleTtlMs = options.credentialHandleTtlMs ?? 5 * 60 * 1000;
    this.taskTtlMs = options.taskTtlMs ?? 60 * 60 * 1000;
    this.taskPollIntervalMs = options.taskPollIntervalMs;
  }

  async createTask(input: ExecutionTaskServiceCreateInput): Promise<CreateTaskResult> {
    const context = RequestContextManager.getContext();
    if (!context) {
      throw new Error('Request context required for execute_task background execution.');
    }

    const token = typeof context.token === 'string' && context.token.length > 0 ? context.token : undefined;
    const apiKey = typeof context.apiKey === 'string' && context.apiKey.length > 0 ? context.apiKey : undefined;

    if ((token ? 1 : 0) + (apiKey ? 1 : 0) !== 1) {
      throw new Error('Exactly one request credential is required for execute_task background execution.');
    }

    const owner = {
      ...(context.sessionId ? { sessionId: context.sessionId } : {}),
      ...(context.userId ? { userId: context.userId } : {})
    };

    const handle = this.authStore.createHandle({
      ...(token ? { token } : {}),
      ...(apiKey ? { apiKey } : {}),
      owner,
      userId: context.userId,
      username: context.username,
      ttlMs: this.credentialHandleTtlMs
    });

    const task = await input.extra.taskStore.createTask({
      ttl: this.taskTtlMs,
      ...(this.taskPollIntervalMs !== undefined
        ? { pollInterval: this.taskPollIntervalMs }
        : {}),
      context: {
        credentialHandleId: handle.handleId,
        targetMaxRows: input.preparedExecution.targetMaxRows
      }
    });

    const job: ExecutionTaskWorkerJob = {
      taskId: task.taskId,
      taskStore: input.extra.taskStore,
      credentialHandleId: handle.handleId,
      credentialOwner: owner,
      preparedExecution: input.preparedExecution
    };

    void Promise.resolve().then(async () => {
      await this.worker.run(job);
    });

    return { task };
  }

  async getTask(
    _input: unknown,
    _getApi: unknown,
    extra: {
      taskId: string;
      taskStore: ExecutionTaskRequestStore;
    }
  ): Promise<GetTaskResult> {
    return await extra.taskStore.getTask(extra.taskId);
  }

  async getTaskResult(
    _input: unknown,
    _getApi: unknown,
    extra: {
      taskId: string;
      taskStore: ExecutionTaskRequestStore & {
        getTaskResult(taskId: string): Promise<CallToolResult>;
      };
    }
  ): Promise<CallToolResult> {
    return await extra.taskStore.getTaskResult(extra.taskId);
  }
}
