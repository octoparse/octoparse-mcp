import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger.js';
import { RequestContextManager } from '../utils/request-context.js';
import { extractRealIP } from '../utils/ip-extractor.js';
import { parseJWTToken } from '../auth.js';

const log = Logger.createNamedLogger('octoparse.mcp.error');

/**
 * Global error handling middleware for Express.
 * Catches errors from:
 * - JSON parsing errors (malformed JSON in request body)
 * - Async errors passed to next(err)
 * - Synchronous errors in middleware
 *
 * This ensures ALL errors are logged with structured format,
 * even if they bypass the request logger.
 */
export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction): void => {
  // Check if request logger already logged this
  const responseLogged = (res as any).__errorLogged;
  if (responseLogged) {
    return;
  }
  (res as any).__errorLogged = true;

  // Get context info (may not exist if error occurred early)
  const authHeader = req.get('authorization');
  const userInfo = parseJWTToken(authHeader);
  const clientIP = extractRealIP(req);

  // Determine status code
  const statusCode = res.statusCode >= 400 ? res.statusCode : 500;

  RequestContextManager.setErrorContext(err, {
    status: statusCode,
    source: 'errorHandler'
  });

  // Build error log entry
  const logOptions = {
    requestId: RequestContextManager.getRequestId?.() || undefined,
    correlationId: req.get('x-correlation-id') || undefined,
    method: req.method,
    url: req.originalUrl || req.url,
    path: req.body?.method || 'unknown',
    ip: clientIP,
    userAgent: req.get('user-agent'),
    sessionId: req.get('mcp-session-id') || undefined,
    userId: userInfo?.id,
    username: userInfo?.username,
    status: statusCode,
    error: err,
    exception: err.message || 'Unknown error',
    meta: {
      stack: err.stack,
      errorName: err.name
    }
  };

  // Log the error
  log.error(`[${err.name}] ${err.message}`, logOptions);

  // Send JSON-RPC error response if not already sent
  if (!res.headersSent) {
    res.status(statusCode).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message
      },
      id: req.body?.id || null
    });
  }
};

/**
 * Handle uncaught exceptions at process level.
 * This is a last resort for errors that escape all other handlers.
 */
export const setupProcessErrorHandlers = (): void => {
  // Unhandled Promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    log.logError('Unhandled Promise Rejection', error, {
      meta: { reason }
    });
    // In production, you might want to exit and let PM2/Docker restart
    // process.exit(1);
  });

  // Uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    log.logError('Uncaught Exception', error, {
      meta: { stack: error.stack }
    });
    // Exit with error code - process is in unknown state
    process.exit(1);
  });
};
