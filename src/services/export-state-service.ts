import { AsyncExportDataSourceType, AsyncExportFileStatus, AsyncExportFileType } from '../api/types.js';
import { RedisClient } from '../utils/redis.js';
import { Logger } from '../utils/logger.js';

export type AsyncExportPhase = 'creating' | 'polling' | 'completed' | 'failed';

export interface AsyncExportState {
  taskId: string;
  exportFileType: AsyncExportFileType;
  lot?: string | null;
  createTriggered?: boolean;
  dataSourceType: AsyncExportDataSourceType;
  phase: AsyncExportPhase;
  lastKnownExportFileStatus: AsyncExportFileStatus | null;
  exportProgressPercent: number | null;
  latestExportFileUrl: string | null;
  collectedDataTotal: number | null;
  collectedDataSample: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

export class ExportStateService {
  private static readonly STATE_TTL_SECONDS = 10 * 60;
  private static readonly LOCK_TTL_SECONDS = 60;
  private static readonly STATE_KEY_PREFIX = 'async-export:state:';
  private static readonly LOCK_KEY_PREFIX = 'async-export:lock:';

  public static async getState(
    userIdentity: string,
    taskId: string,
    exportFileType: AsyncExportFileType,
    lot?: string | null
  ): Promise<AsyncExportState | null> {
    const redis = RedisClient.getInstance();
    if (!redis) {
      return null;
    }

    try {
      const data = await redis.get(this.buildStateKey(userIdentity, taskId, exportFileType, lot));
      if (!data) {
        return null;
      }

      return JSON.parse(data) as AsyncExportState;
    } catch (error) {
      Logger.logError(
        `[ExportStateService] Failed to read async export state for task ${taskId}`,
        error as Error,
        { userId: userIdentity }
      );
      return null;
    }
  }

  public static async saveState(userIdentity: string, state: AsyncExportState): Promise<void> {
    const redis = RedisClient.getInstance();
    if (!redis) {
      return;
    }

    try {
      await redis.set(
        this.buildStateKey(userIdentity, state.taskId, state.exportFileType, state.lot),
        JSON.stringify(state),
        'EX',
        this.STATE_TTL_SECONDS
      );
    } catch (error) {
      Logger.logError(
        `[ExportStateService] Failed to persist async export state for task ${state.taskId}`,
        error as Error,
        { userId: userIdentity }
      );
    }
  }

  public static async savePollingState(
    userIdentity: string,
    taskId: string,
    exportFileType: AsyncExportFileType,
    details: {
      lot?: string | null;
      createTriggered?: boolean;
      exportProgressPercent?: number | null;
      latestExportFileStatus?: AsyncExportFileStatus | null;
      latestExportFileUrl?: string | null;
      collectedDataTotal?: number | null;
      collectedDataSample?: Array<Record<string, unknown>>;
    } = {}
  ): Promise<void> {
    const existingState = await this.getState(userIdentity, taskId, exportFileType, details.lot);
    const now = new Date().toISOString();
    const state: AsyncExportState = {
      taskId,
      exportFileType,
      lot: details.lot ?? existingState?.lot ?? null,
      createTriggered: details.createTriggered ?? existingState?.createTriggered ?? false,
      dataSourceType: AsyncExportDataSourceType.TaskData,
      phase: 'polling',
      lastKnownExportFileStatus: details.latestExportFileStatus ?? existingState?.lastKnownExportFileStatus ?? null,
      exportProgressPercent: details.exportProgressPercent ?? existingState?.exportProgressPercent ?? null,
      latestExportFileUrl: details.latestExportFileUrl ?? existingState?.latestExportFileUrl ?? null,
      collectedDataTotal: details.collectedDataTotal ?? existingState?.collectedDataTotal ?? null,
      collectedDataSample: details.collectedDataSample ?? existingState?.collectedDataSample ?? [],
      createdAt: existingState?.createdAt ?? now,
      updatedAt: now
    };

    await this.saveState(userIdentity, state);
  }

  public static async saveCompletedState(
    userIdentity: string,
    taskId: string,
    exportFileType: AsyncExportFileType,
    details: {
      lot?: string | null;
      createTriggered?: boolean;
      latestExportFileUrl?: string | null;
      exportProgressPercent?: number | null;
      latestExportFileStatus?: AsyncExportFileStatus | null;
      collectedDataTotal?: number | null;
      collectedDataSample?: Array<Record<string, unknown>>;
    }
  ): Promise<void> {
    const existingState = await this.getState(userIdentity, taskId, exportFileType, details.lot);
    const now = new Date().toISOString();

    await this.saveState(userIdentity, {
      taskId,
      exportFileType,
      lot: details.lot ?? existingState?.lot ?? null,
      createTriggered: details.createTriggered ?? existingState?.createTriggered ?? true,
      dataSourceType: AsyncExportDataSourceType.TaskData,
      phase: 'completed',
      lastKnownExportFileStatus: details.latestExportFileStatus ?? AsyncExportFileStatus.Generated,
      exportProgressPercent: details.exportProgressPercent ?? 100,
      latestExportFileUrl: details.latestExportFileUrl ?? existingState?.latestExportFileUrl ?? null,
      collectedDataTotal: details.collectedDataTotal ?? existingState?.collectedDataTotal ?? null,
      collectedDataSample: details.collectedDataSample ?? existingState?.collectedDataSample ?? [],
      createdAt: existingState?.createdAt ?? now,
      updatedAt: now
    });
  }

  public static async saveFailedState(
    userIdentity: string,
    taskId: string,
    exportFileType: AsyncExportFileType,
    details: {
      lot?: string | null;
      createTriggered?: boolean;
      exportProgressPercent?: number | null;
      collectedDataTotal?: number | null;
      collectedDataSample?: Array<Record<string, unknown>>;
    } = {}
  ): Promise<void> {
    const existingState = await this.getState(userIdentity, taskId, exportFileType, details.lot);
    const now = new Date().toISOString();

    await this.saveState(userIdentity, {
      taskId,
      exportFileType,
      lot: details.lot ?? existingState?.lot ?? null,
      createTriggered: details.createTriggered ?? existingState?.createTriggered ?? true,
      dataSourceType: AsyncExportDataSourceType.TaskData,
      phase: 'failed',
      lastKnownExportFileStatus: AsyncExportFileStatus.Failed,
      exportProgressPercent: details.exportProgressPercent ?? existingState?.exportProgressPercent ?? null,
      latestExportFileUrl: null,
      collectedDataTotal: details.collectedDataTotal ?? existingState?.collectedDataTotal ?? null,
      collectedDataSample: details.collectedDataSample ?? existingState?.collectedDataSample ?? [],
      createdAt: existingState?.createdAt ?? now,
      updatedAt: now
    });
  }

  public static async tryAcquireCreateLock(
    userIdentity: string,
    taskId: string,
    exportFileType: AsyncExportFileType,
    lot?: string | null
  ): Promise<boolean> {
    const redis = RedisClient.getInstance();
    if (!redis) {
      return true;
    }

    try {
      const result = await redis.set(
        this.buildLockKey(userIdentity, taskId, exportFileType, lot),
        new Date().toISOString(),
        'EX',
        this.LOCK_TTL_SECONDS,
        'NX'
      );

      return result === 'OK';
    } catch (error) {
      Logger.logError(
        `[ExportStateService] Failed to acquire async export lock for task ${taskId}`,
        error as Error,
        { userId: userIdentity }
      );
      return false;
    }
  }

  public static async releaseCreateLock(
    userIdentity: string,
    taskId: string,
    exportFileType: AsyncExportFileType,
    lot?: string | null
  ): Promise<void> {
    const redis = RedisClient.getInstance();
    if (!redis) {
      return;
    }

    try {
      await redis.del(this.buildLockKey(userIdentity, taskId, exportFileType, lot));
    } catch (error) {
      Logger.logError(
        `[ExportStateService] Failed to release async export lock for task ${taskId}`,
        error as Error,
        { userId: userIdentity }
      );
    }
  }

  private static buildStateKey(
    userIdentity: string,
    taskId: string,
    exportFileType: AsyncExportFileType,
    lot?: string | null
  ): string {
    const lotKey = lot === undefined || lot === null ? 'legacy' : String(lot);
    return `${this.STATE_KEY_PREFIX}${this.sanitizeKeyPart(userIdentity)}:${this.sanitizeKeyPart(taskId)}:${exportFileType}:${this.sanitizeKeyPart(lotKey)}`;
  }

  private static buildLockKey(
    userIdentity: string,
    taskId: string,
    exportFileType: AsyncExportFileType,
    lot?: string | null
  ): string {
    const lotKey = lot === undefined || lot === null ? 'legacy' : String(lot);
    return `${this.LOCK_KEY_PREFIX}${this.sanitizeKeyPart(userIdentity)}:${this.sanitizeKeyPart(taskId)}:${exportFileType}:${this.sanitizeKeyPart(lotKey)}`;
  }

  private static sanitizeKeyPart(value: string): string {
    return encodeURIComponent(value);
  }
}
