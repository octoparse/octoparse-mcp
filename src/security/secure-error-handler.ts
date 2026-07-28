import { DataSanitizer } from './jwt-support.js';
import { AppConfig } from '../config/app-config.js';
import { Logger } from '../utils/logger.js';

const secureErrorLog = Logger.createNamedLogger('octoparse.security.secure-error-handler');

/**
 * Secure error handler for production environments
 * Sanitizes error messages to prevent information disclosure
 */
export class SecureErrorHandler {
  private static isDevelopment(): boolean {
    return AppConfig.isDevelopment();
  }

  /**
   * Process error for safe external exposure
   */
  static processError(error: unknown): ProcessedError {
    const processedError: ProcessedError = {
      message: 'An error occurred',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    };

    if (error instanceof Error) {
      if (this.isDevelopment()) {
        processedError.message = DataSanitizer.sanitizeErrorMessage(error.message);
        processedError.stack = this.sanitizeStackTrace(error.stack);
        processedError.name = error.name;
      } else {
        processedError.message = this.getGenericErrorMessage(error);
      }
    }

    return processedError;
  }

  /**
   * Get generic error message based on error characteristics
   */
  private static getGenericErrorMessage(error: Error): string {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return 'Network connection error';
    }

    if (errorMessage.includes('timeout')) {
      return 'Request timeout';
    }

    if (errorMessage.includes('auth') || errorMessage.includes('token') || errorMessage.includes('unauthorized')) {
      return 'Authentication error';
    }

    if (errorMessage.includes('permission') || errorMessage.includes('forbidden')) {
      return 'Permission denied';
    }

    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return 'Invalid request data';
    }

    if (errorMessage.includes('not found') || errorMessage.includes('404')) {
      return 'Resource not found';
    }

    if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
      return 'Rate limit exceeded';
    }

    return 'Internal server error';
  }

  /**
   * Sanitize stack trace for development mode
   */
  private static sanitizeStackTrace(stack?: string): string | undefined {
    if (!stack) return undefined;

    return stack
      .split('\n')
      .map(line => DataSanitizer.sanitizeErrorMessage(line))
      .filter(line => !line.includes('node_modules')) // Remove node_modules paths
      .slice(0, 10) // Limit stack trace length
      .join('\n');
  }

  /**
   * Create user-friendly error response
   */
  static createUserResponse(error: unknown): UserErrorResponse {
    const processed = this.processError(error);

    return {
      success: false,
      error: {
        code: processed.code,
        message: processed.message,
        timestamp: processed.timestamp,
        ...(this.isDevelopment() && { details: processed })
      }
    };
  }

  /**
   * Log error securely for monitoring
   */
  static logError(error: unknown, context?: Record<string, any>): void {
    const processed = this.processError(error);
    const logEntry = {
      ...processed,
      context: context ? DataSanitizer.sanitizeAccountInfo(context) : undefined,
      severity: this.getErrorSeverity(error),
      source: 'mcp-server'
    };

    // In production, use structured logging
    if (this.isDevelopment()) {
      secureErrorLog.error('Error', {
        meta: {
          responseSummary: logEntry
        }
      });
    } else {
      secureErrorLog.error('Secure error entry', {
        meta: {
          responseSummary: logEntry
        }
      });
    }
  }

  /**
   * Determine error severity for monitoring
   */
  private static getErrorSeverity(error: unknown): 'low' | 'medium' | 'high' | 'critical' {
    if (!(error instanceof Error)) return 'medium';

    const message = error.message.toLowerCase();

    if (message.includes('security') || message.includes('breach') || message.includes('injection')) {
      return 'critical';
    }

    if (message.includes('auth') || message.includes('permission') || message.includes('token')) {
      return 'high';
    }

    if (message.includes('network') || message.includes('timeout') || message.includes('rate limit')) {
      return 'medium';
    }

    return 'low';
  }
}

export interface ProcessedError {
  message: string;
  code: string;
  timestamp: string;
  name?: string;
  stack?: string;
  severity?: string;
}

export interface UserErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    timestamp: string;
    details?: ProcessedError;
  };
}
