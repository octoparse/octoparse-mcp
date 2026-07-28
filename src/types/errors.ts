/**
 * Error Types for Self-Correction Mechanism
 *
 * These types define standardized error structures that are designed
 * to be read and understood by LLMs, enabling automatic error recovery.
 */

/**
 * Standard error types that can occur in the Octoparse MCP Server
 */
export enum ErrorType {
  // Template-related errors
  TEMPLATE_LOCAL_ONLY = 'TEMPLATE_LOCAL_ONLY',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',

  // Account-related errors
  ACCOUNT_LEVEL_INSUFFICIENT = 'ACCOUNT_LEVEL_INSUFFICIENT',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',

  // Task-related errors
  TASK_ALREADY_RUNNING = 'TASK_ALREADY_RUNNING',
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  TASK_NOT_RUNNING = 'TASK_NOT_RUNNING',
  TASK_NO_DATA = 'TASK_NO_DATA',

  // Parameter-related errors
  PARAMETER_VALIDATION_FAILED = 'PARAMETER_VALIDATION_FAILED',
  PARAMETER_MISSING = 'PARAMETER_MISSING',

  // Generic errors
  GENERIC_ERROR = 'GENERIC_ERROR',
  API_ERROR = 'API_ERROR'
}

/**
 * Content block in error response
 */
export interface ErrorContent {
  type: 'text';
  text: string;
}

/**
 * Metadata for suggested recovery actions
 */
export interface RecoveryMetadata {
  suggestedAction?: string;
  suggestedParameters?: Record<string, any>;
  filterCriteria?: Record<string, any>;
  alternativeTools?: string[];
}

/**
 * Self-Correction Error Response
 *
 * This structure is optimized for LLM understanding and automatic recovery.
 */
export interface SelfCorrectionError {
  /** Indicates this is an error response */
  isError: true;

  /** Whether the error can be automatically recovered */
  isRecoverable: boolean;

  /** Standardized error type */
  errorType: ErrorType | string;

  /** Whether user action is required (e.g., payment, account upgrade) */
  requiresUserAction?: boolean;

  /** Structured metadata for automated recovery */
  metadata?: RecoveryMetadata & Record<string, any>;

  /** Human-readable (but LLM-optimized) error explanation */
  content: ErrorContent[];
}

/**
 * Type guard to check if a response is a Self-Correction Error
 */
export function isSelfCorrectionError(response: any): response is SelfCorrectionError {
  return (
    response &&
    response.isError === true &&
    typeof response.isRecoverable === 'boolean' &&
    typeof response.errorType === 'string' &&
    Array.isArray(response.content)
  );
}
