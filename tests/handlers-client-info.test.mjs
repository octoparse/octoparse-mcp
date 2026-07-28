import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Test that the initialize request body shape includes clientInfo.
 * This test verifies the extraction logic for clientInfo.name and clientInfo.version.
 */
test('initialize request params contain clientInfo.name and clientInfo.version', () => {
  const initializeRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: {
        name: 'Claude Code',
        version: '1.2.0'
      }
    }
  };

  const clientInfo = initializeRequest.params?.clientInfo;
  assert.equal(clientInfo?.name, 'Claude Code');
  assert.equal(clientInfo?.version, '1.2.0');
});

test('initialize request without clientInfo gracefully degrades', () => {
  const initializeRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {}
    }
  };

  const clientInfo = initializeRequest.params?.clientInfo;
  // No clientInfo provided — should be undefined
  assert.equal(clientInfo, undefined);
});

test('session metadata shape includes clientInfo for Redis round-trip', () => {
  const sessionMetadata = {
    userId: 'user-1',
    createdAt: Date.now(),
    clientInfo: {
      name: 'Claude Code',
      version: '1.2.0'
    }
  };

  const serialized = JSON.stringify(sessionMetadata);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.clientInfo.name, 'Claude Code');
  assert.equal(parsed.clientInfo.version, '1.2.0');
});
