import type { Request, RequestId, Result, Task } from '@modelcontextprotocol/sdk/types.js';
import type { AuthType } from '../auth/token-provider.js';

export type ExecutionTaskStatus = Task['status'];
export type ExecutionTaskResultPayload = Result;
export type ExecutionTaskAuthType = Exclude<AuthType, 'none'>;

export interface ExecutionTaskCredentialOwner {
  sessionId?: string;
  userId?: string;
}

export interface ExecutionTaskRecord {
  mcpTaskId: string;
  octoparseTaskId?: string;
  status: ExecutionTaskStatus;
  statusMessage?: string;
  targetMaxRows?: number;
  quotaStopRequested: boolean;
  credentialHandleId?: string;
  createdAt: string;
  lastUpdatedAt: string;
  ttl: number | null;
  pollInterval?: number;
  finalResult?: ExecutionTaskResultPayload;
}

export interface ExecutionTaskRecordPatch {
  octoparseTaskId?: string;
  targetMaxRows?: number;
  quotaStopRequested?: boolean;
  credentialHandleId?: string;
}

export interface StoredExecutionTaskRecord {
  requestId: RequestId;
  request: Request;
  sessionId?: string;
  record: ExecutionTaskRecord;
}

export interface ExecutionTaskContextInput {
  octoparseTaskId?: string;
  targetMaxRows?: number;
  quotaStopRequested?: boolean;
  credentialHandleId?: string;
}

export interface ExecutionTaskCredentialHandleMetadata {
  handleId: string;
  authType: ExecutionTaskAuthType;
  owner: ExecutionTaskCredentialOwner;
  userId?: string;
  username?: string;
  createdAt: string;
  expiresAt: string;
}

export interface CreateExecutionTaskCredentialHandleInput {
  token?: string;
  apiKey?: string;
  owner: ExecutionTaskCredentialOwner;
  userId?: string;
  username?: string;
  ttlMs?: number;
}

export interface ResolvedExecutionTaskCredentialHandle extends ExecutionTaskCredentialHandleMetadata {
  token?: string;
  apiKey?: string;
}

export interface StoredExecutionTaskCredentialHandle {
  metadata: ExecutionTaskCredentialHandleMetadata;
  token?: string;
  apiKey?: string;
  expiresAtMs: number;
}
