import winston from 'winston';
import os from 'os';
import { AppConfig } from '../config/app-config.js';
import { StructuredLogEntry, LogLevel, FormattedLogLevel, LogOptions } from '../types/log-entry.js';
import { RequestContextManager } from './request-context.js';
import { getCallerInfo, formatCallerInfo } from './stack-tracer.js';

/**
 * Centralized logger service using Winston with structured logging support
 */
export class Logger {
    private static instance: winston.Logger;
    private static appContext = {
        service: '',
        version: '',
        environment: '',
        hostname: os.hostname(),
        pid: process.pid
    };

    /**
     * Get or create logger instance
     */
    public static getInstance(): winston.Logger {
        if (!Logger.instance) {
            Logger.initialize();
        }
        return Logger.instance;
    }

    /**
     * Initialize logger with configuration
     */
    private static initialize(): void {
        const config = AppConfig.getLoggingConfig();
        const serverConfig = AppConfig.getServerConfig();
        const isStructuredLogging = config.enableStructuredLogging;

        // Update app context
        Logger.appContext.service = serverConfig.name;
        Logger.appContext.version = serverConfig.version;
        Logger.appContext.environment = serverConfig.environment;

        const transports: winston.transport[] = [];

        // Console transport
        if (config.enableConsole) {
            if (isStructuredLogging) {
                // Structured JSON format for production/Kibana
                transports.push(new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
                        winston.format.printf((info) => {
                            return JSON.stringify(Logger.buildStructuredLog(info));
                        })
                    )
                }));
            } else {
                // Human-readable format for development
                transports.push(new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                        winston.format.colorize(),
                        winston.format.printf(({ timestamp, level, message, ...meta }: winston.Logform.TransformableInfo) => {
                            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                            return `[${timestamp}] ${level}: ${message}${metaStr}`;
                        })
                    )
                }));
            }
        }

        // File transport - always use JSON format
        if (config.enableFile && config.filePath) {
            transports.push(new winston.transports.File({
                filename: config.filePath,
                maxsize: config.maxFileSize,
                maxFiles: config.maxFiles,
                format: winston.format.combine(
                    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
                    winston.format.printf((info) => {
                        return JSON.stringify(Logger.buildStructuredLog(info));
                    })
                )
            }));
        }

        Logger.instance = winston.createLogger({
            level: config.level,
            transports,
            // Don't exit on handled exceptions
            exitOnError: false
        });
    }

    /**
     * Convert log level to PascalCase format
     */
    private static formatLogLevel(level: LogLevel): FormattedLogLevel {
        const levelMap: Record<LogLevel, FormattedLogLevel> = {
            'debug': 'Debug',
            'info': 'Info',
            'warn': 'Warn',
            'error': 'Error'
        };
        return levelMap[level] || 'Info';
    }

    private static normalizeException(
        error?: Error,
        exception?: string | { name?: string; message: string; stack?: string }
    ): { name?: string; message: string; stack?: string } | undefined {
        if (error) {
            return {
                name: error.name,
                message: error.message,
                stack: error.stack
            };
        }

        if (typeof exception === 'string') {
            return {
                message: exception
            };
        }

        if (exception) {
            return exception;
        }

        return undefined;
    }

    private static normalizeResponseSummary(responseSummary: unknown): unknown {
        if (
            responseSummary === null ||
            responseSummary === undefined ||
            Array.isArray(responseSummary) ||
            typeof responseSummary === 'object'
        ) {
            return responseSummary;
        }

        return {
            value: responseSummary
        };
    }

    /**
     * Build structured log entry compatible with ELK/Kibana
     */
    private static buildStructuredLog(info: winston.Logform.TransformableInfo): StructuredLogEntry {
        // Extract custom fields from info
        const { timestamp, level, message, ...customFields } = info;

        // Get context from AsyncLocalStorage
        const contextOptions = RequestContextManager.getLogOptions();

        // Merge options
        const options: LogOptions = {
            ...contextOptions,
            ...customFields
        };

        // Use explicit loggerName when provided (preferred for ETL filtering),
        // otherwise fall back to stack-trace-based caller detection.
        const logger = options.loggerName ?? formatCallerInfo(getCallerInfo(6));

        // Build base structured log
        const structuredLog: any = {
            '@timestamp': timestamp as string || new Date().toISOString(),
            level: Logger.formatLogLevel(level as LogLevel),
            message: message as string,
            logger: logger || 'unknown'
        };

        // Add HTTP fields
        if (options.method) structuredLog.method = options.method;
        if (options.url) structuredLog.url = options.url;
        if (options.queryString) structuredLog.queryString = options.queryString;
        if (options.path) structuredLog.path = options.path;
        if (options.toolName) structuredLog.toolName = options.toolName;
        if (options.status !== undefined) structuredLog.status = options.status;
        if (options.duration !== undefined) structuredLog.duration = options.duration;
        if (options.ip) structuredLog.ip = options.ip;
        if (options.userAgent) structuredLog.userAgent = options.userAgent;
        if (options.requestId) structuredLog.requestId = options.requestId;
        if (options.correlationId) structuredLog.correlationId = options.correlationId;
        if (options.requestSize !== undefined) structuredLog.requestSize = options.requestSize;
        if (options.responseSize !== undefined) structuredLog.responseSize = options.responseSize;

        // Add error fields
        const exception = Logger.normalizeException(options.error, options.exception);
        if (exception) {
            structuredLog.exception = exception;
        }

        if (options.errorCode) structuredLog.errorCode = options.errorCode;

        // Add user fields
        if (options.userId) structuredLog.userId = options.userId;
        if (options.username) structuredLog.username = options.username;
        if (options.sessionId) structuredLog.sessionId = options.sessionId;
        if (options.apiKeyId) structuredLog.apiKeyId = options.apiKeyId;
        if (options.authType) structuredLog.authType = options.authType;

        // Add custom metadata
        if (options.meta) {
            Object.assign(structuredLog, options.meta);

            if ('responseSummary' in options.meta) {
                structuredLog.responseSummary = Logger.normalizeResponseSummary(options.meta.responseSummary);
            }
        }

        // Build app_info with static context + client info
        structuredLog.app_info = {
            service: Logger.appContext.service,
            version: Logger.appContext.version,
            environment: Logger.appContext.environment,
            hostname: Logger.appContext.hostname,
            pid: Logger.appContext.pid
        };

        if (options.clientName !== undefined || options.clientVersion !== undefined) {
            structuredLog.app_info.clientName = options.clientName;
            structuredLog.app_info.clientVersion = options.clientVersion;
        }

        return structuredLog;
    }

    // Static helper methods for convenience

    public static debug(message: string, options?: LogOptions): void {
        Logger.getInstance().debug(message, options);
    }

    public static info(message: string, options?: LogOptions): void {
        Logger.getInstance().info(message, options);
    }

    public static warn(message: string, options?: LogOptions): void {
        Logger.getInstance().warn(message, options);
    }

    public static error(message: string, options?: LogOptions): void {
        Logger.getInstance().error(message, options);
    }

    /**
     * Log HTTP request
     */
    public static logRequest(message: string, options: LogOptions): void {
        Logger.info(message, options);
    }

    /**
     * Log HTTP response
     */
    public static logResponse(message: string, options: LogOptions): void {
        const level = Logger.getLogLevelByStatus(options.status);
        Logger[level](message, options);
    }

    /**
     * Log error with exception details
     */
    public static logError(message: string, error: Error, options?: LogOptions): void {
        Logger.error(message, {
            ...options,
            error,
            exception: error.message,
            stack: error.stack,
            errorType: error.name
        });
    }

    /**
     * Determine log level based on HTTP status code
     */
    private static getLogLevelByStatus(status?: number): LogLevel {
        if (!status) return 'info';
        if (status >= 500) return 'error';
        if (status >= 400) return 'warn';
        return 'info';
    }

    /**
     * Create a named logger bound to a specific component/domain name.
     * The returned object's methods automatically inject `loggerName` into every log entry,
     * so it shows up as a stable, filterable field in Elasticsearch.
     *
     * Usage:
     *   const log = Logger.createNamedLogger('octoparse.session');
     *   log.info('Session created', { userId: 'u123' });
     *   // → { logger: "octoparse.session", message: "Session created", ... }
     */
    public static createNamedLogger(name: string) {
        return {
            debug: (message: string, options?: LogOptions) =>
                Logger.debug(message, { ...options, loggerName: name }),
            info: (message: string, options?: LogOptions) =>
                Logger.info(message, { ...options, loggerName: name }),
            warn: (message: string, options?: LogOptions) =>
                Logger.warn(message, { ...options, loggerName: name }),
            error: (message: string, options?: LogOptions) =>
                Logger.error(message, { ...options, loggerName: name }),
            logError: (message: string, error: Error, options?: LogOptions) =>
                Logger.logError(message, error, { ...options, loggerName: name }),
        };
    }

    /**
     * Reset logger instance (useful for testing)
     */
    public static reset(): void {
        Logger.instance = null as any;
    }
}
