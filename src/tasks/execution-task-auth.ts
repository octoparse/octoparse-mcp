import { randomBytes } from 'node:crypto';
import type {
  CreateExecutionTaskCredentialHandleInput,
  ExecutionTaskCredentialOwner,
  ExecutionTaskCredentialHandleMetadata,
  ResolvedExecutionTaskCredentialHandle,
  StoredExecutionTaskCredentialHandle
} from './execution-task-types.js';

export type ExecutionTaskAuthHandleErrorCode =
  | 'credential_handle_invalid'
  | 'credential_handle_not_found'
  | 'credential_handle_expired'
  | 'credential_handle_owner_mismatch';

export class ExecutionTaskAuthHandleError extends Error {
  public readonly code: ExecutionTaskAuthHandleErrorCode;

  constructor(code: ExecutionTaskAuthHandleErrorCode, message: string) {
    super(message);
    this.name = 'ExecutionTaskAuthHandleError';
    this.code = code;
  }
}

export interface ExecutionTaskAuthStore {
  createHandle(
    input: CreateExecutionTaskCredentialHandleInput
  ): ExecutionTaskCredentialHandleMetadata;
  resolveHandle(
    handleId: string,
    owner: ExecutionTaskCredentialOwner
  ): ResolvedExecutionTaskCredentialHandle;
  deleteHandle(handleId: string): boolean;
  cleanupExpiredHandles(): number;
}

export interface InMemoryExecutionTaskAuthStoreOptions {
  defaultTtlMs?: number;
  generateHandleId?: () => string;
  now?: () => number;
}

function toIsoString(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function createDefaultHandleId(): string {
  return randomBytes(16).toString('hex');
}

export class InMemoryExecutionTaskAuthStore implements ExecutionTaskAuthStore {
  private readonly handles = new Map<string, StoredExecutionTaskCredentialHandle>();
  private readonly expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly defaultTtlMs: number;
  private readonly generateHandleId: () => string;
  private readonly now: () => number;

  constructor(options: InMemoryExecutionTaskAuthStoreOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 5 * 60 * 1000;
    this.generateHandleId = options.generateHandleId ?? createDefaultHandleId;
    this.now = options.now ?? Date.now;
  }

  createHandle(
    input: CreateExecutionTaskCredentialHandleInput
  ): ExecutionTaskCredentialHandleMetadata {
    const hasToken = typeof input.token === 'string' && input.token.length > 0;
    const hasApiKey = typeof input.apiKey === 'string' && input.apiKey.length > 0;

    if (hasToken === hasApiKey) {
      throw new ExecutionTaskAuthHandleError(
        'credential_handle_invalid',
        'Exactly one raw credential must be provided when creating a credential handle.'
      );
    }

    const ttlMs = input.ttlMs ?? this.defaultTtlMs;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new ExecutionTaskAuthHandleError(
        'credential_handle_invalid',
        'Credential handle TTL must be a positive finite number.'
      );
    }
    if (!hasOwnerBinding(input.owner)) {
      throw new ExecutionTaskAuthHandleError(
        'credential_handle_invalid',
        'Credential handles must be bound to at least one owner identifier.'
      );
    }

    const createdAtMs = this.now();
    const expiresAtMs = createdAtMs + ttlMs;
    const handleId = this.createUniqueHandleId();
    const metadata: ExecutionTaskCredentialHandleMetadata = {
      handleId,
      authType: hasToken ? 'jwt' : 'apikey',
      owner: { ...input.owner },
      userId: input.userId,
      username: input.username,
      createdAt: toIsoString(createdAtMs),
      expiresAt: toIsoString(expiresAtMs)
    };

    this.handles.set(handleId, {
      metadata,
      token: hasToken ? input.token : undefined,
      apiKey: hasApiKey ? input.apiKey : undefined,
      expiresAtMs
    });
    this.armExpiryTimer(handleId, ttlMs);

    return { ...metadata };
  }

  resolveHandle(
    handleId: string,
    owner: ExecutionTaskCredentialOwner
  ): ResolvedExecutionTaskCredentialHandle {
    const stored = this.handles.get(handleId);
    if (!stored) {
      throw new ExecutionTaskAuthHandleError(
        'credential_handle_not_found',
        `Credential handle ${handleId} was not found.`
      );
    }
    if (!ownerMatches(stored.metadata.owner, owner)) {
      throw new ExecutionTaskAuthHandleError(
        'credential_handle_owner_mismatch',
        `Credential handle ${handleId} is not accessible from this owner context.`
      );
    }

    if (this.now() > stored.expiresAtMs) {
      this.deleteStoredHandle(handleId);
      throw new ExecutionTaskAuthHandleError(
        'credential_handle_expired',
        `Credential handle ${handleId} has expired.`
      );
    }

    return {
      ...stored.metadata,
      ...(stored.token ? { token: stored.token } : {}),
      ...(stored.apiKey ? { apiKey: stored.apiKey } : {})
    };
  }

  deleteHandle(handleId: string): boolean {
    return this.deleteStoredHandle(handleId);
  }

  cleanupExpiredHandles(): number {
    const currentTime = this.now();
    let deletedCount = 0;

    for (const [handleId, stored] of this.handles.entries()) {
      if (currentTime > stored.expiresAtMs) {
        this.deleteStoredHandle(handleId);
        deletedCount += 1;
      }
    }

    return deletedCount;
  }

  private createUniqueHandleId(): string {
    let handleId = this.generateHandleId();
    while (this.handles.has(handleId)) {
      handleId = this.generateHandleId();
    }
    return handleId;
  }

  private armExpiryTimer(handleId: string, ttlMs: number): void {
    const existingTimer = this.expiryTimers.get(handleId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.expiryTimers.delete(handleId);
    }

    const timer = setTimeout(() => {
      this.deleteStoredHandle(handleId);
    }, Math.max(0, ttlMs));

    timer.unref?.();
    this.expiryTimers.set(handleId, timer);
  }

  private deleteStoredHandle(handleId: string): boolean {
    const existingTimer = this.expiryTimers.get(handleId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.expiryTimers.delete(handleId);
    }

    return this.handles.delete(handleId);
  }
}

export function createExecutionTaskAuthStore(
  options: InMemoryExecutionTaskAuthStoreOptions = {}
): ExecutionTaskAuthStore {
  return new InMemoryExecutionTaskAuthStore(options);
}

function hasOwnerBinding(owner: ExecutionTaskCredentialOwner): boolean {
  return (
    (typeof owner.sessionId === 'string' && owner.sessionId.length > 0) ||
    (typeof owner.userId === 'string' && owner.userId.length > 0)
  );
}

function ownerMatches(
  expected: ExecutionTaskCredentialOwner,
  actual: ExecutionTaskCredentialOwner
): boolean {
  if (!hasOwnerBinding(actual)) {
    return false;
  }

  if (expected.sessionId && expected.sessionId !== actual.sessionId) {
    return false;
  }
  if (expected.userId && expected.userId !== actual.userId) {
    return false;
  }

  return true;
}
