/**
 * Application configuration management
 * Centralizes all configuration values and provides type-safe access
 */

export interface HttpConfig {
  timeout: number;
  retries: number;
  retryDelay: number;
  maxRedirects: number;
  userAgent: string;
  acceptLanguage: string;
}

export interface ApiEndpoints {
  clientApi: string;
  officialSiteUrl: string;
  upgradeUrl: string;
  downloadUrl: string;
}

export interface SecurityConfig {
  allowedOrigins: string | string[];
  trustProxy: boolean;
}

export interface ServerConfig {
  name: string;
  version: string;
  port: number;
  host: string;
  publicBaseUrl: string;
  environment: string; // Allow any string value to support custom environments like 'prd.bzy', 'prd.op', etc.
  transportIdleTTLSeconds: number;
  transportCleanupIntervalSeconds: number;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  maxFileSize: number;
  maxFiles: number;
  enableStructuredLogging: boolean;
}

export interface TaskConfig {
  enabled: boolean;
  pollIntervalMs: number;
  resultTtlMs: number | null;
  lockTtlMs: number;
  credentialHandleTtlMs: number;
}

export interface UiConfig {
  widgetClientAllowList: string[];
  /** @deprecated Use widgetClientAllowList. Kept as a compatibility alias for older callers. */
  metaClientAllowList: string[];
}

export interface RedisConfig {
  enabled: boolean;
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  tls: boolean;
  sessionTTL: number; // Session expiration time in seconds
  templateSchemaCacheTTL: number;
}

export interface AppConfiguration {
  server: ServerConfig;
  api: ApiEndpoints;
  http: HttpConfig;
  security: SecurityConfig;
  logging: LoggingConfig;
  tasks: TaskConfig;
  ui: UiConfig;
  redis: RedisConfig;
  development: boolean;
}

/**
 * Configuration manager with environment variable support and enhanced security
 */
export class AppConfig {
  private static instance: AppConfiguration | null = null;

  /**
   * AppConfig sits below Logger in the startup dependency graph, so config parsing uses
   * direct stderr writes instead of Logger to avoid circular initialization.
   */
  private static writeConfigMessage(level: 'WARN' | 'ERROR', message: string): void {
    process.stderr.write(`[AppConfig] ${level}: ${message}\n`);
  }

  private static warn(message: string): void {
    AppConfig.writeConfigMessage('WARN', message);
  }

  private static error(message: string): void {
    AppConfig.writeConfigMessage('ERROR', message);
  }

  /**
   * Get application configuration
   */
  static getConfig(): AppConfiguration {
    if (!AppConfig.instance) {
      AppConfig.instance = AppConfig.loadConfig();
    }
    return AppConfig.instance;
  }

  /**
   * Load configuration from environment variables with defaults
   */
  private static loadConfig(): AppConfiguration {
    // Read NODE_ENV from environment variables (loaded from .env file)
    const env = process.env.NODE_ENV || 'development';
    // Determine if production based on env value containing 'prd' or being 'production'
    const isProduction = env === 'production' || env.includes('prd');

    return {
      server: {
        name: process.env.SERVER_NAME || 'octoparse-mcp-server',
        version: process.env.SERVER_VERSION || '1.0.0',
        port: this.parseInteger(process.env.PORT, 8080, 1, 65535),
        host: process.env.HOST || '0.0.0.0',
        publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || '',
        environment: env, // Use actual NODE_ENV value from environment file
        transportIdleTTLSeconds: this.parseInteger(
          process.env.TRANSPORT_IDLE_TTL_SECONDS,
          1800,
          60,
          86400
        ),
        transportCleanupIntervalSeconds: this.parseInteger(
          process.env.TRANSPORT_CLEANUP_INTERVAL_SECONDS,
          300,
          30,
          3600
        )
      },
      api: {
        clientApi: process.env.CLIENTAPI_BASE_URL || 'https://v2.clientapi.octoparse.com',
        officialSiteUrl: process.env.OFFICIAL_SITE_URL || 'https://www.octoparse.com',
        upgradeUrl: process.env.OFFICIAL_UPGRADE_URL || 'https://www.octoparse.com/pricing',
        downloadUrl: process.env.OFFICIAL_DOWNLOAD_URL || 'https://www.octoparse.com/download'
      },
      http: {
        timeout: this.parseInteger(process.env.HTTP_TIMEOUT, 30000, 1000, 300000),
        retries: this.parseInteger(process.env.HTTP_RETRIES, 3, 0, 10),
        retryDelay: this.parseInteger(process.env.HTTP_RETRY_DELAY, 1000, 100, 10000),
        maxRedirects: this.parseInteger(process.env.HTTP_MAX_REDIRECTS, 5, 0, 20),
        userAgent: process.env.HTTP_USER_AGENT || 'Octoparse-MCP-Server/1.0',
        acceptLanguage: process.env.HTTP_ACCEPT_LANGUAGE || 'en-US'
      },
      security: {
        allowedOrigins: this.parseCorsOrigins(process.env.ALLOWED_ORIGINS, '*'),
        trustProxy: this.parseBoolean(process.env.TRUST_PROXY, false)
      },
      logging: {
        level: this.parseLogLevel(process.env.LOG_LEVEL, isProduction ? 'warn' : 'debug'),
        enableConsole: this.parseBoolean(process.env.LOG_ENABLE_CONSOLE, true),
        enableFile: this.parseBoolean(process.env.LOG_ENABLE_FILE, isProduction),
        filePath: process.env.LOG_FILE_PATH,
        maxFileSize: this.parseInteger(process.env.LOG_MAX_FILE_SIZE, 10485760, 1024, 104857600), // 10MB
        maxFiles: this.parseInteger(process.env.LOG_MAX_FILES, 5, 1, 100),
        enableStructuredLogging: this.parseBoolean(process.env.LOG_STRUCTURED, isProduction)
      },
      tasks: {
        enabled: this.parseBoolean(process.env.MCP_TASKS_ENABLED, true),
        pollIntervalMs: this.parseInteger(process.env.EXECUTION_TASK_POLL_INTERVAL_MS, 3000, 100, 60000),
        resultTtlMs: this.parseNullableInteger(process.env.EXECUTION_TASK_RESULT_TTL_SECONDS, 3600, 0, 604800),
        lockTtlMs: this.parseInteger(process.env.EXECUTION_TASK_LOCK_TTL_SECONDS, 300, 1, 86400) * 1000,
        credentialHandleTtlMs: this.parseInteger(process.env.EXECUTION_TASK_CREDENTIAL_HANDLE_TTL_SECONDS, 300, 1, 86400) * 1000
      },
      ui: this.loadUiConfig(),
      redis: {
        enabled: this.parseBoolean(process.env.REDIS_ENABLED, false),
        host: process.env.REDIS_HOST || 'localhost',
        port: this.parseInteger(process.env.REDIS_PORT, 6379, 1, 65535),
        password: process.env.REDIS_PASSWORD,
        db: this.parseInteger(process.env.REDIS_DB, 0, 0, 15),
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'mcp:',
        tls: this.parseBoolean(process.env.REDIS_TLS, false),
        sessionTTL: this.parseInteger(process.env.REDIS_SESSION_TTL, 2592000, 60, 31536000), // Default 30 days, min 1 min, max 1 year
        templateSchemaCacheTTL: this.parseInteger(process.env.REDIS_TEMPLATE_SCHEMA_CACHE_TTL, 300, 60, 3600)
      },
      development: !isProduction
    };
  }

  /**
   * Parse integer with validation
   */
  private static parseInteger(value: string | undefined, defaultValue: number, min?: number, max?: number): number {
    if (!value) return defaultValue;

    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      AppConfig.warn(`Invalid integer value: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }

    if (min !== undefined && parsed < min) {
      AppConfig.warn(`Value ${parsed} below minimum ${min}, using minimum`);
      return min;
    }

    if (max !== undefined && parsed > max) {
      AppConfig.warn(`Value ${parsed} above maximum ${max}, using maximum`);
      return max;
    }

    return parsed;
  }

  private static parseNullableInteger(
    value: string | undefined,
    defaultValueSeconds: number | null,
    minSeconds?: number,
    maxSeconds?: number
  ): number | null {
    if (!value) {
      return defaultValueSeconds === null ? null : defaultValueSeconds * 1000;
    }

    if (value.trim().toLowerCase() === 'null') {
      return null;
    }

    const parsed = this.parseInteger(value, defaultValueSeconds ?? 0, minSeconds, maxSeconds);
    return parsed * 1000;
  }

  /**
   * Parse boolean with validation
   */
  private static parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (!value) return defaultValue;

    const lowerValue = value.toLowerCase();
    if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') {
      return true;
    }
    if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no') {
      return false;
    }

    AppConfig.warn(`Invalid boolean value: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }

  /**
   * Parse string array from comma-separated values
   */
  private static parseStringArray(value: string | undefined, defaultValue: string[]): string[] {
    if (!value) return defaultValue;

    return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
  }

  private static parseCorsOrigins(
    value: string | undefined,
    defaultValue: string | string[]
  ): string | string[] {
    if (!value) return defaultValue;

    const trimmed = value.trim();
    if (trimmed === '*') {
      return '*';
    }

    return this.parseStringArray(value, Array.isArray(defaultValue) ? defaultValue : [defaultValue]);
  }

  /**
   * Parse log level with validation
   */
  private static parseLogLevel(value: string | undefined, defaultValue: 'debug' | 'info' | 'warn' | 'error'): 'debug' | 'info' | 'warn' | 'error' {
    if (!value) return defaultValue;

    const validLevels: Array<'debug' | 'info' | 'warn' | 'error'> = ['debug', 'info', 'warn', 'error'];
    const lowerValue = value.toLowerCase() as any;

    if (validLevels.includes(lowerValue)) {
      return lowerValue;
    }

    AppConfig.warn(`Invalid log level: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }

  /**
   * Validate configuration with enhanced security checks
   */
  static validateConfig(): void {
    const config = AppConfig.getConfig();
    const errors: string[] = [];

    // Validate required fields
    if (!config.api.clientApi) {
      errors.push('CLIENTAPI_BASE_URL is required');
    }

    // Validate URLs
    try {
      new URL(config.api.clientApi);
    } catch (error) {
      errors.push('Invalid CLIENTAPI_BASE_URL format');
    }

    try {
      new URL(config.api.officialSiteUrl);
    } catch (error) {
      errors.push('Invalid OFFICIAL_SITE_URL format');
    }

    try {
      new URL(config.api.upgradeUrl);
    } catch (error) {
      errors.push('Invalid OFFICIAL_UPGRADE_URL format');
    }

    try {
      new URL(config.api.downloadUrl);
    } catch (error) {
      errors.push('Invalid OFFICIAL_DOWNLOAD_URL format');
    }

    // Validate numeric values
    if (config.server.port < 1 || config.server.port > 65535) {
      errors.push('Invalid port number (must be 1-65535)');
    }

    if (config.server.transportCleanupIntervalSeconds >= config.server.transportIdleTTLSeconds) {
      AppConfig.warn(
        'TRANSPORT_CLEANUP_INTERVAL_SECONDS is greater than or equal to TRANSPORT_IDLE_TTL_SECONDS; cleanup may lag behind transport expiry'
      );
    }

    try {
      new URL(config.server.publicBaseUrl);
    } catch (error) {
      errors.push('Invalid PUBLIC_BASE_URL format');
    }

    if (config.http.timeout < 1000) {
      errors.push('HTTP timeout must be at least 1000ms');
    }

    // CORS validation
    if (
      (config.security.allowedOrigins === '*' ||
        (Array.isArray(config.security.allowedOrigins) &&
          config.security.allowedOrigins.includes('*'))) &&
      config.server.environment === 'production'
    ) {
      AppConfig.warn('Wildcard CORS origin (*) is not recommended in production');
    }

    // Log validation results
    if (errors.length > 0) {
      AppConfig.error('Configuration validation failed:');
      errors.forEach(error => AppConfig.error(`  - ${error}`));

      const hasCriticalPublicBaseUrlError = errors.includes('Invalid PUBLIC_BASE_URL format');

      if (hasCriticalPublicBaseUrlError || config.server.environment === 'production') {
        throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
      }
    }
  }

  /**
   * Get specific configuration section
   */
  static getServerConfig(): ServerConfig {
    return AppConfig.getConfig().server;
  }

  static getApiConfig(): ApiEndpoints {
    return AppConfig.getConfig().api;
  }

  static getHttpConfig(): HttpConfig {
    return AppConfig.getConfig().http;
  }

  static getSecurityConfig(): SecurityConfig {
    return AppConfig.getConfig().security;
  }

  static getLoggingConfig(): LoggingConfig {
    return AppConfig.getConfig().logging;
  }

  static getTaskConfig(): TaskConfig {
    return AppConfig.getConfig().tasks;
  }

  private static loadUiConfig(): UiConfig {
    const rawWidgetAllowList = process.env.UI_WIDGET_CLIENT_ALLOW_LIST;
    const rawLegacyMetaAllowList = process.env.UI_META_CLIENT_ALLOW_LIST;
    const widgetClientAllowList = this.parseStringArray(
      rawWidgetAllowList ?? rawLegacyMetaAllowList,
      ['openai-mcp']
    );

    if (rawWidgetAllowList === undefined && rawLegacyMetaAllowList !== undefined) {
      AppConfig.warn('UI_META_CLIENT_ALLOW_LIST is deprecated; use UI_WIDGET_CLIENT_ALLOW_LIST instead.');
    }

    return {
      widgetClientAllowList,
      metaClientAllowList: widgetClientAllowList
    };
  }

  static getUiConfig(): UiConfig {
    return AppConfig.getConfig().ui;
  }

  static getRedisConfig(): RedisConfig {
    const config = AppConfig.getConfig().redis;
    // Ensure sessionTTL has a valid default (for backward compatibility with cached config)
    if (config.sessionTTL === undefined || config.sessionTTL === null) {
      config.sessionTTL = 2592000; // 30 days default
    }
    if (config.templateSchemaCacheTTL === undefined || config.templateSchemaCacheTTL === null) {
      config.templateSchemaCacheTTL = 300;
    }
    return config;
  }

  /**
   * Check if running in development mode
   */
  static isDevelopment(): boolean {
    return AppConfig.getConfig().development;
  }

  /**
   * Check if running in production mode
   */
  static isProduction(): boolean {
    return AppConfig.getConfig().server.environment === 'production';
  }

  /**
   * Get environment-specific configuration
   */
  static getEnvironment(): string {
    return AppConfig.getConfig().server.environment;
  }

  /**
   * Get sanitized configuration for logging (removes sensitive data)
   */
  static getSanitizedConfig(): Partial<AppConfiguration> {
    const config = AppConfig.getConfig();
    return {
      server: config.server,
      api: config.api,
      http: { ...config.http, userAgent: config.http.userAgent },
      tasks: config.tasks,
      ui: config.ui,
      security: {
        allowedOrigins: config.security.allowedOrigins,
        trustProxy: config.security.trustProxy
        // Sensitive values like secrets are omitted
      },
      logging: config.logging,
      development: config.development
    };
  }

  /**
   * Generate random secret (for development)
   */
  static generateSecret(length: number = 64): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Reset configuration (useful for testing)
   */
  static reset(): void {
    AppConfig.instance = null;
  }
}

// Note: Configuration validation is deferred until after environment variables are loaded
// This is done in index.ts after loadEnvironmentConfig() is called
