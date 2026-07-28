import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { Logger } from '../utils/logger.js';
import { RequestContextManager } from '../utils/request-context.js';
import { LogOptions } from '../types/log-entry.js';
import { parseJWTToken } from '../auth.js';
import { extractApiKeyFromHeaders } from '../utils/request-auth.js';
import { extractRealIP } from '../utils/ip-extractor.js';

/**
 * Derive the stable API Key ID from the raw key using SHA-1.
 * Matches the C# implementation exactly.
 */
function computeKeyId(fullKey: string): string {
  return createHash('sha1').update(fullKey, 'utf8').digest('hex');
}

const log = Logger.createNamedLogger('octoparse.mcp.http');

/**
 * Health check endpoints that should be excluded from request logging
 */
const IGNORED_PATHS = ['/hc', '/liveness'];
const LOG_SUMMARY_MAX_DEPTH = 3;
const LOG_SUMMARY_ARRAY_SAMPLE = 2;

/**
 * Check if the request should be ignored for logging
 */
const shouldIgnoreLogging = (req: Request): boolean => {
  return req.method === 'GET' && IGNORED_PATHS.includes(req.path);
};

/**
 * Extract semantic MCP operation path from the request.
 *
 * MCP uses JSON-RPC 2.0 over HTTP POST. The `method` field in the body
 * identifies the operation. Full enumeration:
 *
 *   POST body.method            → path value
 *   ----------------------------+----------------------------
 *   initialize                  → 'initialize'
 *   tools/call (params.name=X)  → 'tools/call:<X>'
 *   tools/list                  → 'tools/list'
 *   resources/list              → 'resources/list'
 *   resources/read              → 'resources/read'
 *   resources/subscribe         → 'resources/subscribe'
 *   resources/unsubscribe       → 'resources/unsubscribe'
 *   prompts/list                → 'prompts/list'
 *   prompts/get (params.name=X) → 'prompts/get:<X>'
 *   ping                        → 'ping'
 *   notifications/initialized   → 'notifications/initialized'
 *   notifications/cancelled     → 'notifications/cancelled'
 *   notifications/progress      → 'notifications/progress'
 *
 *   GET  (SSE stream)           → 'sse'
 *   DELETE (session terminate)  → 'session/delete'
 */
function extractMcpPath(req: Request): string {
  if (req.method === 'GET') return 'sse';
  if (req.method === 'DELETE') return 'session/delete';

  const mcpMethod: string | undefined = req.body?.method;
  if (!mcpMethod) return 'unknown';

  if (mcpMethod === 'tools/call') {
    const toolName: string | undefined = req.body?.params?.name;
    return toolName ? `tools/call:${toolName}` : 'tools/call';
  }

  if (mcpMethod === 'prompts/get') {
    const promptName: string | undefined = req.body?.params?.name;
    return promptName ? `prompts/get:${promptName}` : 'prompts/get';
  }

  return mcpMethod;
}

function summarizeArray(value: unknown[], depth: number): Record<string, unknown> {
  return {
    type: 'array',
    count: value.length,
    sample: value.slice(0, LOG_SUMMARY_ARRAY_SAMPLE).map((item) => summarizeForLogging(item, depth + 1))
  };
}

function summarizeObjectEntries(
  value: Record<string, unknown>,
  depth: number
): Record<string, unknown> {
  const summary: Record<string, unknown> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue === undefined) {
      continue;
    }

    if (key === 'data') {
      if (Array.isArray(entryValue)) {
        summary.data = {
          type: 'array',
          count: entryValue.length
        };
      } else if (entryValue && typeof entryValue === 'object') {
        summary.data = {
          type: 'object',
          keys: Object.keys(entryValue as Record<string, unknown>).slice(0, 10)
        };
      } else {
        summary.data = entryValue;
      }
      continue;
    }

    if (key === 'content' && Array.isArray(entryValue)) {
      summary.content = {
        type: 'array',
        count: entryValue.length,
        sample: entryValue.slice(0, 1).map((block) => {
          if (block && typeof block === 'object' && 'text' in (block as Record<string, unknown>)) {
            return {
              type: (block as Record<string, unknown>).type,
              textLength: String((block as Record<string, unknown>).text ?? '').length
            };
          }
          return summarizeForLogging(block, depth + 1);
        })
      };
      continue;
    }

    summary[key] = summarizeForLogging(entryValue, depth + 1);
  }

  return summary;
}

function summarizeForLogging(value: unknown, depth: number = 0): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (depth >= LOG_SUMMARY_MAX_DEPTH) {
    if (Array.isArray(value)) {
      return { type: 'array', count: value.length };
    }
    if (typeof value === 'object') {
      return {
        type: 'object',
        keys: Object.keys(value as Record<string, unknown>).slice(0, 10)
      };
    }
  }

  if (Array.isArray(value)) {
    return summarizeArray(value, depth);
  }

  if (typeof value === 'object') {
    return summarizeObjectEntries(value as Record<string, unknown>, depth);
  }

  return String(value);
}

function summarizeResponseBody(body: any): unknown {
  if (body === null || body === undefined) {
    return null;
  }

  if (body?.error) {
    return {
      jsonrpcError: {
        code: body.error.code,
        message: body.error.message
      }
    };
  }

  if (body?.content?.[0]?.text) {
    try {
      const parsed = JSON.parse(body.content[0].text);
      return {
        isError: body?.isError === true || parsed?.success === false,
        payload: summarizeForLogging(parsed)
      };
    } catch {
      return {
        isError: body?.isError === true,
        contentTextLength: String(body.content[0].text).length
      };
    }
  }

  return summarizeForLogging(body);
}

function buildExceptionFromContextError(
  errorContext: ReturnType<typeof RequestContextManager.getErrorContext>
): { name?: string; message: string; stack?: string } | undefined {
  if (!errorContext?.message) {
    return undefined;
  }

  return {
    name: errorContext.name,
    message: errorContext.message,
    stack: errorContext.stack
  };
}

/**
 * Request logging middleware with structured logging support.
 * Logs a single entry per request at response time, combining both
 * request and response context so every record is self-contained.
 * Initializes request context for the duration of the request.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const ignoreLogging = shouldIgnoreLogging(req);

  // Parse JWT token to extract userId from the sub claim
  const authHeader = req.get('authorization');
  const apiKey = extractApiKeyFromHeaders(authHeader, req.get('x-api-key') || undefined);
  const userInfo = apiKey ? undefined : parseJWTToken(authHeader);
  const userId = userInfo?.id;
  const username = userInfo?.username;

  // Extract API key from header and compute key ID for logging
  const apiKeyId = apiKey ? computeKeyId(apiKey) : undefined;

  // Extract real client IP address
  const clientIP = extractRealIP(req);

  // Initialize request context (AsyncLocalStorage)
  const correlationId = req.get('x-correlation-id') || undefined;
  const sessionId = req.get('mcp-session-id') || undefined;

  const context = RequestContextManager.initContext({
    correlationId,
    sessionId,
    method: req.method,
    url: req.originalUrl || req.url,
    host: req.get('host') || req.hostname,
    ip: clientIP,
    userAgent: req.get('user-agent'),
    userId,
    username,
    apiKeyId,
    authType: apiKeyId ? 'apiKey' : (userId ? 'jwt' : undefined),
    token: apiKey ? undefined : authHeader,
    apiKey
  });

  // Capture request-time fields that may not be available from context at response time
  const queryString = req.originalUrl.split('?')[1] || undefined;
  const mcpPath = extractMcpPath(req);
  const toolName: string | undefined = req.body?.method === 'tools/call'
    ? req.body?.params?.name
    : undefined;
  const requestSize = req.get('content-length')
    ? parseInt(req.get('content-length')!, 10)
    : (req.body ? JSON.stringify(req.body).length : undefined);

  // Track if response has been logged to avoid duplicates
  let responseLogged = false;

  // Capture original res.json and res.send to intercept the response body
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  const originalEnd = res.end.bind(res);

  res.json = function (body: any): Response {
    if (!responseLogged) {
      logResponse(body);
      responseLogged = true;
    }
    return originalJson(body);
  };

  res.send = function (body: any): Response {
    if (!responseLogged) {
      let parsedBody = body;
      if (typeof body === 'string') {
        try { parsedBody = JSON.parse(body); } catch (_) { parsedBody = body; }
      }
      logResponse(parsedBody);
      responseLogged = true;
    }
    return originalSend(body);
  };

  res.end = function (chunk?: any, ...args: any[]): Response {
    if (!responseLogged) {
      logResponse(null);
      responseLogged = true;
    }
    return originalEnd(chunk, ...args) as Response;
  };

  // Single log entry emitted at response time, carrying full request + response context
  function logResponse(responseBody: any): void {
    if (ignoreLogging) return;

    const latestContext = RequestContextManager.getContext() ?? context;
    const requestErrorContext = RequestContextManager.getErrorContext();
    const effectiveStatus = requestErrorContext?.status ?? res.statusCode;
    const duration = RequestContextManager.getRequestDuration();
    const responseSummary = summarizeResponseBody(responseBody);
    const responseSize = res.get('content-length')
      ? parseInt(res.get('content-length')!, 10)
      : (responseSummary ? JSON.stringify(responseSummary).length : undefined);

    // Extract error information from various MCP response formats
    const errorInfo = extractErrorInfo(responseBody, res.statusCode);

    // Build base log options
    const meta: Record<string, unknown> = { responseSummary };
    if (latestContext.toolInput) {
      meta.toolInput = latestContext.toolInput;
    }
    if (latestContext.toolOutput) {
      meta.toolOutput = latestContext.toolOutput;
    }

    const logOptions: LogOptions = {
      // Request context
      requestId: latestContext.requestId,
      correlationId: latestContext.correlationId,
      method: req.method,
      url: context.url,
      queryString,
      path: mcpPath,
      toolName,
      ip: latestContext.ip,
      userAgent: latestContext.userAgent,
      sessionId: latestContext.sessionId,
      userId: latestContext.userId,
      username: latestContext.username,
      apiKeyId: latestContext.apiKeyId,
      authType: latestContext.authType,
      requestSize,
      // Response context
      status: effectiveStatus,
      duration,
      responseSize,
      meta
    };

    // Determine log level based on error status
    const statusLevel = effectiveStatus >= 500 ? 'error' : effectiveStatus >= 400 ? 'warn' : errorInfo.isError ? 'warn' : 'info';

    // Set message and exception based on error info
    let message: string;
    if (requestErrorContext?.message) {
      message = requestErrorContext.message;
      logOptions.exception = buildExceptionFromContextError(requestErrorContext);
    } else if (errorInfo.message) {
      message = errorInfo.message;
    } else if (effectiveStatus >= 400) {
      message = '';
      logOptions.exception = `HTTP ${effectiveStatus}`;
    } else {
      message = '';
    }

    if (!requestErrorContext?.message && errorInfo.exception) {
      logOptions.exception = errorInfo.exception;
    }
    if (errorInfo.error) {
      logOptions.error = errorInfo.error;
    }

    log[statusLevel](message, logOptions);
  }

  /**
   * Extract error information from various MCP response formats
   *
   * Supports:
   * 1. Standard JSON-RPC error: { jsonrpc, error: {code, message}, id }
   * 2. MCP tool error with isError flag: { content: [...], isError: true }
   * 3. ApiResponse wrapped in content: { content: [{text: JSON.stringify({success: false, error})}] }
   * 4. HTTP status code errors
   */
  function extractErrorInfo(body: any, statusCode: number): { isError: boolean; message?: string; exception?: string; error?: any } {
    if (typeof body === 'string' && body.trim().length > 0 && statusCode >= 400) {
      return {
        isError: true,
        message: body,
        exception: body
      };
    }

    // Format 1: Standard JSON-RPC error
    if (body?.error) {
      return {
        isError: true,
        message: body.error.message || '',
        exception: body.error.message || `JSON-RPC Error ${body.error.code}`,
        error: body.error
      };
    }

    // Format 2 & 3: MCP content format with isError flag OR ApiResponse format
    if (body?.content?.[0]?.text) {
      const errorText = body.content[0].text;

      // Check for explicit isError flag (MCP standard)
      const hasIsErrorFlag = body?.isError === true;

      // Try to parse the content text as JSON
      try {
        const parsed = JSON.parse(errorText);

        // ApiResponse format: { success: false, error: {...} }
        if (parsed?.success === false && parsed?.error) {
          return {
            isError: true,
            message: parsed.error.message || '',
            exception: parsed.error.message || parsed.error.code || 'API Error',
            error: parsed.error
          };
        }

        // If isError flag is set but content is not ApiResponse format
        if (hasIsErrorFlag) {
          return {
            isError: true,
            message: errorText,
            exception: errorText
          };
        }
      } catch {
        // Not valid JSON - if isError flag is set, treat as error
        if (hasIsErrorFlag) {
          return {
            isError: true,
            message: errorText,
            exception: errorText
          };
        }
      }
    }

    // Format 4: HTTP status code indicates error but no error body
    if (statusCode >= 400) {
      return {
        isError: true,
        message: '',
        exception: `HTTP ${statusCode}`
      };
    }

    return { isError: false };
  }

  res.on('error', (error: Error) => {
    if (!responseLogged && !ignoreLogging) {
      RequestContextManager.setErrorContext(error, {
        status: res.statusCode >= 400 ? res.statusCode : 500,
        source: 'response'
      });

      log.logError('Request processing error', error, {
        requestId: context.requestId,
        method: req.method,
        url: context.url,
        path: mcpPath,
        userId: (RequestContextManager.getContext() ?? context).userId,
        status: res.statusCode >= 400 ? res.statusCode : 500
      });
      responseLogged = true;
    }
  });

  next();
};
