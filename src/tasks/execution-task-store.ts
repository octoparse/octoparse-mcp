import { randomBytes } from 'node:crypto';
import { isTerminal, type CreateTaskOptions, type TaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js';
import type { Request, RequestId, Result, Task } from '@modelcontextprotocol/sdk/types.js';
import type {
  ExecutionTaskContextInput,
  ExecutionTaskRecord,
  ExecutionTaskRecordPatch,
  ExecutionTaskResultPayload,
  StoredExecutionTaskRecord
} from './execution-task-types.js';

interface ExecutionTaskStoreEntry {
  stored: StoredExecutionTaskRecord;
}

export interface ExecutionTaskStore extends TaskStore {
  getExecutionTaskRecord(taskId: string, sessionId?: string): Promise<ExecutionTaskRecord>;
  updateExecutionTaskRecord(
    taskId: string,
    patch: ExecutionTaskRecordPatch,
    sessionId?: string
  ): Promise<ExecutionTaskRecord>;
  listExecutionTaskRecords(
    cursor?: string,
    sessionId?: string
  ): Promise<{ tasks: ExecutionTaskRecord[]; nextCursor?: string }>;
  cleanup(): void;
}

export interface InMemoryExecutionTaskStoreOptions {
  defaultPollInterval?: number;
  pageSize?: number;
  generateTaskId?: () => string;
  now?: () => number;
}

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_PAGE_SIZE = 50;

function createDefaultTaskId(): string {
  return randomBytes(16).toString('hex');
}

function toIsoString(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function cloneResult<T extends Result>(value: T): T {
  return structuredClone(value);
}

function cloneRecord(record: ExecutionTaskRecord): ExecutionTaskRecord {
  return structuredClone(record);
}

function toTask(record: ExecutionTaskRecord): Task {
  return {
    taskId: record.mcpTaskId,
    status: record.status,
    ttl: record.ttl,
    createdAt: record.createdAt,
    lastUpdatedAt: record.lastUpdatedAt,
    ...(record.pollInterval !== undefined ? { pollInterval: record.pollInterval } : {}),
    ...(record.statusMessage ? { statusMessage: record.statusMessage } : {})
  };
}

function readExecutionTaskContext(context: Record<string, unknown> | undefined): ExecutionTaskContextInput {
  const readString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined;
  const readNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  const readBoolean = (value: unknown): boolean | undefined =>
    typeof value === 'boolean' ? value : undefined;

  return {
    octoparseTaskId: readString(context?.octoparseTaskId),
    targetMaxRows: readNumber(context?.targetMaxRows),
    quotaStopRequested: readBoolean(context?.quotaStopRequested),
    credentialHandleId: readString(context?.credentialHandleId)
  };
}

export class InMemoryExecutionTaskStore implements ExecutionTaskStore {
  private readonly tasks = new Map<string, ExecutionTaskStoreEntry>();
  private readonly cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly defaultPollInterval: number;
  private readonly pageSize: number;
  private readonly generateTaskId: () => string;
  private readonly now: () => number;

  constructor(options: InMemoryExecutionTaskStoreOptions = {}) {
    this.defaultPollInterval = options.defaultPollInterval ?? DEFAULT_POLL_INTERVAL_MS;
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.generateTaskId = options.generateTaskId ?? createDefaultTaskId;
    this.now = options.now ?? Date.now;
  }

  async createTask(
    taskParams: CreateTaskOptions,
    requestId: RequestId,
    request: Request,
    sessionId?: string
  ): Promise<Task> {
    const taskId = this.createUniqueTaskId();
    const createdAt = toIsoString(this.now());
    const context = readExecutionTaskContext(taskParams.context);
    const record: ExecutionTaskRecord = {
      mcpTaskId: taskId,
      octoparseTaskId: context.octoparseTaskId,
      status: 'working',
      targetMaxRows: context.targetMaxRows,
      quotaStopRequested: context.quotaStopRequested ?? false,
      credentialHandleId: context.credentialHandleId,
      createdAt,
      lastUpdatedAt: createdAt,
      ttl: taskParams.ttl ?? null,
      pollInterval: taskParams.pollInterval ?? this.defaultPollInterval
    };

    this.tasks.set(taskId, {
      stored: {
        requestId,
        request: cloneResult(request),
        sessionId,
        record
      }
    });

    this.armCleanupTimer(taskId, record.ttl);
    return toTask(record);
  }

  async getTask(taskId: string, _sessionId?: string): Promise<Task | null> {
    const entry = this.tasks.get(taskId);
    if (!entry || !this.canAccessEntry(entry, _sessionId)) {
      return null;
    }

    return toTask(entry.stored.record);
  }

  async storeTaskResult(
    taskId: string,
    status: 'completed' | 'failed',
    result: Result,
    sessionId?: string
  ): Promise<void> {
    const entry = this.getTaskEntry(taskId, sessionId);
    const currentStatus = entry.stored.record.status;
    const preserveTerminalStatus =
      currentStatus === 'cancelled' ||
      currentStatus === 'input_required' ||
      currentStatus === status;
    if (isTerminal(currentStatus) && !preserveTerminalStatus) {
      throw new Error(
        `Cannot store result for task ${taskId} in terminal status '${currentStatus}'.`
      );
    }

    entry.stored.record.status = preserveTerminalStatus
      ? entry.stored.record.status
      : status;
    entry.stored.record.finalResult = cloneResult(result as ExecutionTaskResultPayload);
    entry.stored.record.lastUpdatedAt = toIsoString(this.now());
    if (!preserveTerminalStatus) {
      entry.stored.record.statusMessage = undefined;
    }

    this.armCleanupTimer(taskId, entry.stored.record.ttl);
  }

  async getTaskResult(taskId: string, sessionId?: string): Promise<Result> {
    const entry = this.getTaskEntry(taskId, sessionId);
    if (!entry.stored.record.finalResult) {
      throw new Error(`Task ${taskId} has no result stored.`);
    }

    return cloneResult(entry.stored.record.finalResult);
  }

  async updateTaskStatus(
    taskId: string,
    status: Task['status'],
    statusMessage?: string,
    sessionId?: string
  ): Promise<void> {
    const entry = this.getTaskEntry(taskId, sessionId);
    if (isTerminal(entry.stored.record.status)) {
      throw new Error(
        `Cannot update task ${taskId} from terminal status '${entry.stored.record.status}'.`
      );
    }

    entry.stored.record.status = status;
    entry.stored.record.statusMessage = statusMessage;
    entry.stored.record.lastUpdatedAt = toIsoString(this.now());

    if (isTerminal(status)) {
      this.armCleanupTimer(taskId, entry.stored.record.ttl);
    }
  }

  async listTasks(
    cursor?: string,
    _sessionId?: string
  ): Promise<{ tasks: Task[]; nextCursor?: string }> {
    const listed = await this.listExecutionTaskRecords(cursor, _sessionId);
    return {
      tasks: listed.tasks.map((record) => toTask(record)),
      nextCursor: listed.nextCursor
    };
  }

  async getExecutionTaskRecord(taskId: string, sessionId?: string): Promise<ExecutionTaskRecord> {
    return cloneRecord(this.getTaskEntry(taskId, sessionId).stored.record);
  }

  async updateExecutionTaskRecord(
    taskId: string,
    patch: ExecutionTaskRecordPatch,
    sessionId?: string
  ): Promise<ExecutionTaskRecord> {
    const entry = this.getTaskEntry(taskId, sessionId);
    if (patch.octoparseTaskId !== undefined) {
      entry.stored.record.octoparseTaskId = patch.octoparseTaskId;
    }
    if (patch.targetMaxRows !== undefined) {
      entry.stored.record.targetMaxRows = patch.targetMaxRows;
    }
    if (patch.quotaStopRequested !== undefined) {
      entry.stored.record.quotaStopRequested = patch.quotaStopRequested;
    }
    if (patch.credentialHandleId !== undefined) {
      entry.stored.record.credentialHandleId = patch.credentialHandleId;
    }

    entry.stored.record.lastUpdatedAt = toIsoString(this.now());
    return cloneRecord(entry.stored.record);
  }

  async listExecutionTaskRecords(
    cursor?: string,
    _sessionId?: string
  ): Promise<{ tasks: ExecutionTaskRecord[]; nextCursor?: string }> {
    const taskIds = Array.from(this.tasks.entries())
      .filter(([, entry]) => this.canAccessEntry(entry, _sessionId))
      .map(([taskId]) => taskId);
    let startIndex = 0;

    if (cursor) {
      const cursorIndex = taskIds.indexOf(cursor);
      if (cursorIndex === -1) {
        throw new Error(`Invalid cursor: ${cursor}`);
      }
      startIndex = cursorIndex + 1;
    }

    const pageTaskIds = taskIds.slice(startIndex, startIndex + this.pageSize);
    const tasks = pageTaskIds.map((taskId) => cloneRecord(this.tasks.get(taskId)!.stored.record));
    const nextCursor =
      startIndex + this.pageSize < taskIds.length
        ? pageTaskIds[pageTaskIds.length - 1]
        : undefined;

    return { tasks, nextCursor };
  }

  cleanup(): void {
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }

    this.cleanupTimers.clear();
    this.tasks.clear();
  }

  private createUniqueTaskId(): string {
    let taskId = this.generateTaskId();
    while (this.tasks.has(taskId)) {
      taskId = this.generateTaskId();
    }
    return taskId;
  }

  private getTaskEntry(taskId: string, _sessionId?: string): ExecutionTaskStoreEntry {
    const entry = this.tasks.get(taskId);
    if (!entry) {
      throw new Error(`Task with ID ${taskId} not found.`);
    }
    if (!this.canAccessEntry(entry, _sessionId)) {
      throw new Error(`Task with ID ${taskId} is not accessible from this session.`);
    }
    return entry;
  }

  private canAccessEntry(entry: ExecutionTaskStoreEntry, sessionId?: string): boolean {
    const storedSessionId = entry.stored.sessionId;
    if (!storedSessionId) {
      return sessionId === undefined;
    }

    return storedSessionId === sessionId;
  }

  private armCleanupTimer(taskId: string, ttlMs: number | null): void {
    const existingTimer = this.cleanupTimers.get(taskId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.cleanupTimers.delete(taskId);
    }

    if (ttlMs === null) {
      return;
    }

    const timer = setTimeout(() => {
      this.tasks.delete(taskId);
      this.cleanupTimers.delete(taskId);
    }, Math.max(0, ttlMs));

    timer.unref?.();
    this.cleanupTimers.set(taskId, timer);
  }
}

export function createExecutionTaskStore(
  options: InMemoryExecutionTaskStoreOptions = {}
): ExecutionTaskStore {
  return new InMemoryExecutionTaskStore(options);
}
