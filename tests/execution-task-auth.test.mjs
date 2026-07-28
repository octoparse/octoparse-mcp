import test from 'node:test';
import assert from 'node:assert/strict';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('createHandle returns opaque metadata and resolveHandle returns the raw credential in memory only', async () => {
  const { InMemoryExecutionTaskAuthStore } = await import('../dist/tasks/execution-task-auth.js');

  const store = new InMemoryExecutionTaskAuthStore({
    defaultTtlMs: 30_000,
    generateHandleId: () => 'handle-jwt-1',
    now: () => 1_000
  });

  const metadata = store.createHandle({
    token: 'raw-jwt-token',
    userId: 'user-1',
    username: 'alice',
    owner: {
      sessionId: 'session-1',
      userId: 'user-1'
    }
  });

  assert.equal(metadata.handleId, 'handle-jwt-1');
  assert.equal(metadata.authType, 'jwt');
  assert.equal(metadata.userId, 'user-1');
  assert.equal(metadata.username, 'alice');
  assert.equal(metadata.createdAt, '1970-01-01T00:00:01.000Z');
  assert.equal(metadata.expiresAt, '1970-01-01T00:00:31.000Z');
  assert.equal('token' in metadata, false);
  assert.equal('apiKey' in metadata, false);

  const resolved = store.resolveHandle('handle-jwt-1', {
    sessionId: 'session-1',
    userId: 'user-1'
  });

  assert.equal(resolved.handleId, 'handle-jwt-1');
  assert.equal(resolved.authType, 'jwt');
  assert.equal(resolved.token, 'raw-jwt-token');
  assert.equal(resolved.userId, 'user-1');
  assert.equal(resolved.username, 'alice');

  assert.equal(store.deleteHandle('handle-jwt-1'), true);
  assert.equal(store.deleteHandle('handle-jwt-1'), false);
});

test('resolveHandle rejects expired or missing handles and removes expired credentials from lookup', async () => {
  const {
    InMemoryExecutionTaskAuthStore,
    ExecutionTaskAuthHandleError
  } = await import('../dist/tasks/execution-task-auth.js');

  let currentTime = 10_000;
  const store = new InMemoryExecutionTaskAuthStore({
    defaultTtlMs: 5_000,
    generateHandleId: () => 'handle-api-key-1',
    now: () => currentTime
  });

  const metadata = store.createHandle({
    apiKey: 'raw-api-key',
    userId: 'user-2',
    owner: {
      sessionId: 'session-2',
      userId: 'user-2'
    }
  });

  assert.equal(metadata.authType, 'apikey');

  currentTime = 15_001;

  assert.throws(() => store.resolveHandle('handle-api-key-1', {
    sessionId: 'session-2',
    userId: 'user-2'
  }), (error) => {
    assert.equal(error instanceof ExecutionTaskAuthHandleError, true);
    assert.equal(error.code, 'credential_handle_expired');
    return true;
  });

  assert.throws(() => store.resolveHandle('handle-api-key-1', {
    sessionId: 'session-2',
    userId: 'user-2'
  }), (error) => {
    assert.equal(error instanceof ExecutionTaskAuthHandleError, true);
    assert.equal(error.code, 'credential_handle_not_found');
    return true;
  });

  assert.throws(() => store.resolveHandle('missing-handle', {
    sessionId: 'session-2',
    userId: 'user-2'
  }), (error) => {
    assert.equal(error instanceof ExecutionTaskAuthHandleError, true);
    assert.equal(error.code, 'credential_handle_not_found');
    return true;
  });
});

test('resolveHandle rejects owner mismatches instead of treating handle ids as process-wide bearer tokens', async () => {
  const {
    InMemoryExecutionTaskAuthStore,
    ExecutionTaskAuthHandleError
  } = await import('../dist/tasks/execution-task-auth.js');

  const store = new InMemoryExecutionTaskAuthStore({
    generateHandleId: () => 'handle-owner-bound'
  });

  store.createHandle({
    token: 'raw-owner-token',
    userId: 'user-owner',
    owner: {
      sessionId: 'session-owner',
      userId: 'user-owner'
    }
  });

  assert.throws(() => store.resolveHandle('handle-owner-bound', {
    sessionId: 'session-other',
    userId: 'user-owner'
  }), (error) => {
    assert.equal(error instanceof ExecutionTaskAuthHandleError, true);
    assert.equal(error.code, 'credential_handle_owner_mismatch');
    return true;
  });

  assert.throws(() => store.resolveHandle('handle-owner-bound', {
    sessionId: 'session-owner',
    userId: 'user-other'
  }), (error) => {
    assert.equal(error instanceof ExecutionTaskAuthHandleError, true);
    assert.equal(error.code, 'credential_handle_owner_mismatch');
    return true;
  });

  const resolved = store.resolveHandle('handle-owner-bound', {
    sessionId: 'session-owner',
    userId: 'user-owner'
  });

  assert.equal(resolved.token, 'raw-owner-token');
});

test('expired handles are actively removed from memory without waiting for a later lookup', async () => {
  const {
    InMemoryExecutionTaskAuthStore,
    ExecutionTaskAuthHandleError
  } = await import('../dist/tasks/execution-task-auth.js');

  const store = new InMemoryExecutionTaskAuthStore({
    defaultTtlMs: 10,
    generateHandleId: () => 'handle-active-expiry'
  });

  store.createHandle({
    apiKey: 'raw-short-lived-key',
    owner: {
      sessionId: 'session-short',
      userId: 'user-short'
    }
  });

  await delay(25);

  assert.equal(store.cleanupExpiredHandles(), 0);
  assert.throws(() => store.resolveHandle('handle-active-expiry', {
    sessionId: 'session-short',
    userId: 'user-short'
  }), (error) => {
    assert.equal(error instanceof ExecutionTaskAuthHandleError, true);
    assert.equal(error.code, 'credential_handle_not_found');
    return true;
  });
});
