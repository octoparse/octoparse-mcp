import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';
import { LogOptions } from '../types/log-entry.js';
import type { UiClientPolicy } from '../widget-adapter/ui-client-policy.js';

/**
 * Request context data stored for the duration of a request
 */
export interface RequestContext {
  requestId: string;
  correlationId: string;
  method?: string;
  url?: string;
  host?: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  username?: string;
  sessionId?: string;
  apiKeyId?: string;  // SHA-1 hash of API key for logging
  authType?: string;
  token?: string;     // JWT token for the current request
  apiKey?: string;    // API key for the current request
  clientName?: string;  // MCP client name from initialize.clientInfo
  clientVersion?: string;  // MCP client version from initialize.clientInfo
  uiPolicy?: UiClientPolicy;
  toolInput?: Record<string, unknown>;
  toolOutput?: Record<string, unknown>;
  errorContext?: RequestErrorContext;
  startTime: number;
  [key: string]: any;
}

export interface RequestErrorContext {
  name?: string;
  message: string;
  stack?: string;
  code?: string;
  status?: number;
  source?: string;
}

/**
 * Authentication info extracted from request context
 */
export interface AuthFromContext {
  token?: string;
  apiKey?: string;
  apiKeyId?: string;
  userId?: string;
}

/**
 * Request context manager using AsyncLocalStorage
 * Provides request-scoped context storage without explicit passing
 */
export class RequestContextManager {
  private static storage = new AsyncLocalStorage<RequestContext>();

  /**
   * Initialize a new request context
   */
  static initContext(initialData?: Partial<RequestContext>): RequestContext {
    const context: RequestContext = {
      requestId: uuidv4(),
      correlationId: initialData?.correlationId || uuidv4(),
      startTime: Date.now(),
      ...initialData
    };

    RequestContextManager.storage.enterWith(context);
    return context;
  }

  /**
   * Get current request context
   */
  static getContext(): RequestContext | undefined {
    return RequestContextManager.storage.getStore();
  }

  /**
   * Get request ID from current context
   */
  static getRequestId(): string | undefined {
    return RequestContextManager.getContext()?.requestId;
  }

  /**
   * Get correlation ID from current context
   */
  static getCorrelationId(): string | undefined {
    return RequestContextManager.getContext()?.correlationId;
  }

  /**
   * Get request duration in milliseconds
   */
  static getRequestDuration(): number | undefined {
    const context = RequestContextManager.getContext();
    if (!context) return undefined;
    return Date.now() - context.startTime;
  }

  /**
   * Update the current request context in place.
   * Preserves the original request/correlation identifiers.
   */
  static updateContext(partial: Partial<RequestContext>): RequestContext | undefined {
    const context = RequestContextManager.getContext();
    if (!context) return undefined;

    Object.assign(context, partial);
    return context;
  }

  /**
   * Record structured error details for the current request.
   */
  static setErrorContext(
    error: unknown,
    options?: {
      code?: string;
      status?: number;
      source?: string;
    }
  ): RequestErrorContext | undefined {
    const context = RequestContextManager.getContext();
    if (!context) return undefined;

    const normalizedError: RequestErrorContext = {
      message: error instanceof Error ? error.message : String(error)
    };

    if (error instanceof Error) {
      normalizedError.name = error.name;
      normalizedError.stack = error.stack;
    }

    if (options?.code) normalizedError.code = options.code;
    if (options?.status !== undefined) normalizedError.status = options.status;
    if (options?.source) normalizedError.source = options.source;

    context.errorContext = normalizedError;
    return normalizedError;
  }

  /**
   * Get structured error details for the current request.
   */
  static getErrorContext(): RequestErrorContext | undefined {
    return RequestContextManager.getContext()?.errorContext;
  }

  /**
   * Extract log options from current context
   */
  static getLogOptions(): LogOptions {
    const context = RequestContextManager.getContext();
    if (!context) return {};

    const duration = RequestContextManager.getRequestDuration();

    return {
      requestId: context.requestId,
      correlationId: context.correlationId,
      method: context.method,
      url: context.url,
      host: context.host,
      ip: context.ip,
      userAgent: context.userAgent,
      userId: context.userId,
      username: context.username,
      sessionId: context.sessionId,
      apiKeyId: context.apiKeyId,
      authType: context.authType,
      duration,
      clientName: context.clientName,
      clientVersion: context.clientVersion
    };
  }

  /**
   * Run a function with a specific context
   */
  static runWithContext<T>(context: RequestContext, fn: () => T): T {
    return RequestContextManager.storage.run(context, fn);
  }
}
