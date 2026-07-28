import test from 'node:test';
import assert from 'node:assert/strict';

import { Logger } from '../dist/utils/logger.js';
import { RequestContextManager } from '../dist/utils/request-context.js';

Logger.getInstance();

test('buildStructuredLog emits request client info and stable app_info fields', () => {
  RequestContextManager.runWithContext(
    {
      requestId: 'req-appinfo-1',
      correlationId: 'corr-appinfo-1',
      startTime: Date.now(),
      clientName: 'Claude Code',
      clientVersion: '1.2.0'
    },
    () => {
      const log = Logger.buildStructuredLog({
        timestamp: '2026-04-20T10:00:00.000+00:00',
        level: 'info',
        message: 'test log',
        loggerName: 'octoparse.mcp.http'
      });

      assert.equal(log.app_info.clientName, 'Claude Code');
      assert.equal(log.app_info.clientVersion, '1.2.0');
      assert.ok(log.app_info.service);
      assert.ok(log.app_info.version);
      assert.ok(log.app_info.environment);
      assert.ok(log.app_info.hostname);
      assert.ok(log.app_info.pid);
    }
  );
});

test('buildStructuredLog omits unset request client info', () => {
  RequestContextManager.runWithContext(
    {
      requestId: 'req-appinfo-2',
      correlationId: 'corr-appinfo-2',
      startTime: Date.now()
    },
    () => {
      const log = Logger.buildStructuredLog({
        timestamp: '2026-04-20T10:00:00.000+00:00',
        level: 'info',
        message: 'test log',
        loggerName: 'octoparse.mcp.http'
      });

      assert.equal(log.app_info.clientName, undefined);
      assert.equal(log.app_info.clientVersion, undefined);
    }
  );
});

test('buildStructuredLog normalizes primitive structured fields', () => {
  const exceptionLog = Logger.buildStructuredLog({
    timestamp: '2026-04-15T02:29:31.690+00:00',
    level: 'warn',
    message: '',
    loggerName: 'octoparse.mcp.http',
    exception: 'HTTP 401'
  });
  assert.deepEqual(exceptionLog.exception, {
    message: 'HTTP 401'
  });

  const responseLog = Logger.buildStructuredLog({
    timestamp: '2026-04-15T02:29:31.690+00:00',
    level: 'warn',
    message: '',
    loggerName: 'octoparse.mcp.http',
    meta: {
      responseSummary: 'Session not found or invalid authentication'
    }
  });
  assert.deepEqual(responseLog.responseSummary, {
    value: 'Session not found or invalid authentication'
  });
});

test('getLogOptions reads client info from request context', () => {
  RequestContextManager.runWithContext(
    {
      requestId: 'req-client-1',
      correlationId: 'corr-client-1',
      startTime: Date.now()
    },
    () => {
      RequestContextManager.updateContext({
        clientName: 'Claude Code',
        clientVersion: '1.2.0'
      });

      const logOptions = RequestContextManager.getLogOptions();
      assert.equal(logOptions.clientName, 'Claude Code');
      assert.equal(logOptions.clientVersion, '1.2.0');
    }
  );

  RequestContextManager.runWithContext(
    {
      requestId: 'req-client-2',
      correlationId: 'corr-client-2',
      startTime: Date.now()
    },
    () => {
      const logOptions = RequestContextManager.getLogOptions();
      assert.equal(logOptions.clientName, undefined);
      assert.equal(logOptions.clientVersion, undefined);
    }
  );
});
