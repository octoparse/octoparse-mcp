/**
 * Structured log entry format for Kibana/ELK
 * This format ensures logs are properly parsed and indexed by log aggregation systems
 */

/**
 * Log severity level
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Formatted log level for output (PascalCase)
 */
export type FormattedLogLevel = 'Debug' | 'Info' | 'Warn' | 'Error';

/**
 * HTTP-related log fields
 */
export interface HttpLogFields {
  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method?: string;

  /** Full URL path with query string */
  url?: string;

  /** Query string portion of the URL (without leading '?') */
  queryString?: string;

  /**
   * Semantic operation path for MCP protocol routing.
   * Examples: 'initialize', 'tools/call:getTaskList', 'tools/list',
   * 'resources/list', 'resources/read', 'prompts/list', 'prompts/get',
   * 'ping', 'sse', 'session/delete'
   */
  path?: string;

  /** MCP tool name, only present for tools/call requests (e.g. 'getTaskList') */
  toolName?: string;

  /** HTTP host header */
  host?: string;

  /** HTTP status code */
  status?: number;

  /** Request duration in milliseconds */
  duration?: number;

  /** Client IP address */
  ip?: string;

  /** User agent string */
  userAgent?: string;

  /** Request ID for tracing */
  requestId?: string;

  /** Correlation ID for distributed tracing */
  correlationId?: string;

  /** Request body size in bytes */
  requestSize?: number;

  /** Response body size in bytes */
  responseSize?: number;
}

/**
 * Error/Exception fields
 */
export interface ErrorLogFields {
  /** Exception details. LogOptions may provide a string, but structured logs normalize this to an object. */
  exception?: string | {
    name?: string;
    message: string;
    stack?: string;
  };

  /** Stack trace */
  stack?: string;

  /** Error code */
  errorCode?: string;

  /** Error type/class name */
  errorType?: string;
}

/**
 * User/Authentication fields
 */
export interface UserLogFields {
  /** User ID */
  userId?: string;

  /** Username */
  username?: string;

  /** Session ID */
  sessionId?: string;

  /** API Key ID (SHA-1 hash of the API key for tracing without exposing the secret) */
  apiKeyId?: string;

  /** Authentication type: 'jwt' | 'apiKey' | etc */
  authType?: string;
}

/**
 * Application context fields
 */
export interface AppContextFields {
  /** Service/Application name */
  service: string;

  /** Application version */
  version: string;

  /** Environment (development, production, etc.) */
  environment: string;

  /** Server hostname */
  hostname: string;

  /** Process ID */
  pid: number;

  /** MCP client name from initialize.clientInfo */
  clientName?: string;

  /** MCP client version from initialize.clientInfo */
  clientVersion?: string;
}

/**
 * Complete structured log entry
 * This structure is compatible with ELK/Kibana and other log aggregation systems
 */
export interface StructuredLogEntry extends HttpLogFields, ErrorLogFields, UserLogFields {
  /** ISO 8601 timestamp */
  '@timestamp': string;

  /** Log level */
  level: LogLevel;

  /** Log message */
  message: string;

  /** Application context */
  app_info: AppContextFields;

  /** Additional custom fields */
  [key: string]: any;
}

/**
 * Options for creating a structured log entry
 */
export interface LogOptions extends Partial<HttpLogFields>, Partial<ErrorLogFields>, Partial<UserLogFields> {
  /** Additional custom metadata */
  meta?: Record<string, any>;

  /** Error object (will be automatically parsed) */
  error?: Error;

  /**
   * Explicit logger name for filtering in Elasticsearch/Kibana.
   * When provided, this value is used as-is for the `logger` field instead of
   * the auto-detected stack trace caller. Use business-domain names like:
   *   'octoparse.auth', 'octoparse.session', 'octoparse.tools.task'
   * This is the recommended approach for ETL pipelines that need stable field values.
   */
  loggerName?: string;

  /** MCP client name (propagated from RequestContext to app_info) */
  clientName?: string;

  /** MCP client version (propagated from RequestContext to app_info) */
  clientVersion?: string;
}
