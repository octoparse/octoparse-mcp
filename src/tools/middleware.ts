import { OctoparseApi } from '../api/octoparse.js';
import { OctoparseApiError } from '../api/types.js';
import { SecureErrorHandler } from '../security/secure-error-handler.js';
import { ApiResponse, McpToolResponse } from './tool-definition.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Error codes - centralized enum
 */
export const ErrorCodes = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  API_ERROR: 'API_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

/**
 * Unified error handler
 * Converts any error to standardized ApiResponse
 * Now async to support async userId retrieval
 */
export async function handleError(error: unknown, api?: OctoparseApi): Promise<ApiResponse> {
  // Get userId asynchronously
  const userId = api ? await api.getUserId() : undefined;

  // Log error securely
  SecureErrorHandler.logError(error, {
    userId,
    timestamp: new Date().toISOString()
  });

  // Handle OctoparseApiError
  if (error instanceof OctoparseApiError) {
    return {
      success: false,
      error: {
        code: error.code || ErrorCodes.API_ERROR,
        message: SecureErrorHandler.processError(error).message,
        statusCode: error.statusCode
      },
      metadata: { userId: userId ?? undefined }
    };
  }

  // Handle authentication errors
  if (error instanceof Error && error.message.includes('Authentication required')) {
    return {
      success: false,
      error: {
        code: ErrorCodes.AUTH_REQUIRED,
        message: 'Authentication required. Please provide a valid Bearer token.'
      }
    };
  }

  // Handle validation errors
  if (error instanceof Error && error.message.includes('Validation error')) {
    return {
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: error.message
      }
    };
  }

  // Handle JWT-related errors
  if (error instanceof Error && (
    error.message.includes('JWT') ||
    error.message.includes('token') ||
    error.message.includes('expired')
  )) {
    return {
      success: false,
      error: {
        code: ErrorCodes.INVALID_TOKEN,
        message: 'Invalid or expired authentication token'
      }
    };
  }

  // Generic error
  const processedError = SecureErrorHandler.processError(error);
  return {
    success: false,
    error: {
      code: ErrorCodes.UNKNOWN_ERROR,
      message: processedError.message
    },
    metadata: { userId: userId ?? undefined }
  };
}

/**
 * Middleware: Authentication check
 * Now async to support async isAuthenticated check
 */
export async function checkAuth(api?: OctoparseApi): Promise<ApiResponse | null> {
  if (!api || !await api.isAuthenticated()) {
    return {
      success: false,
      error: {
        code: ErrorCodes.AUTH_REQUIRED,
        message: 'Authentication required. Please provide a valid Bearer token.'
      }
    };
  }
  return null;
}

function isCallToolResultLike(response: unknown): response is CallToolResult {
  return !!response && typeof response === 'object' && Array.isArray((response as CallToolResult).content);
}

/**
 * Convert ApiResponse to MCP format
 *
 * Follows MCP protocol specification:
 * - Success responses: { content: [...] }
 * - Business error responses: { content: [...], isError: true }
 *
 * Note: This uses MCP's standard `isError` flag to indicate business-level errors,
 * NOT transport-level errors. Transport errors (401, 403, etc.) should be handled
 * at the HTTP layer with appropriate status codes.
 */
export function toMcpResponse(response: ApiResponse | CallToolResult): McpToolResponse {
  if (isCallToolResultLike(response)) {
    return response as McpToolResponse;
  }

  const isError = !response.success;

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(response, null, 2)
    }],
    structuredContent: response,
    ...(isError && { isError: true })
  };
}

/**
 * Create success response
 * Now async to support async userId retrieval
 */
export async function createSuccessResponse<T>(data: T, api?: OctoparseApi): Promise<ApiResponse<T>> {
  const userId = api ? await api.getUserId() : undefined;
  return {
    success: true,
    data,
    metadata: {
      userId: userId ?? undefined,
      timestamp: new Date().toISOString()
    }
  };
}
