import { z } from 'zod';
import type {
  CreateTaskRequestHandlerExtra,
  TaskRequestHandlerExtra,
  TaskToolExecution
} from '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type {
  CallToolResult,
  CreateTaskResult,
  GetTaskResult
} from '@modelcontextprotocol/sdk/types.js';
import { OctoparseApi } from '../api/octoparse.js';
import type { ToolUiBinding } from '../widget-adapter/tool-ui-contract.js';

/**
 * Factory function type for creating API instances
 * Allows lazy creation of API instances with fresh tokens on each request
 */
export type ApiFactory = () => Promise<OctoparseApi | undefined>;

/**
 * Tool handler function signature
 * Receives a factory function that creates API instances with fresh tokens
 *
 * Usage in handler:
 *   const api = await getApi();
 *   if (!api) throw new Error('API instance required');
 *   const result = await api.someMethod();
 */
export type ToolHandler<TInput = any, TOutput = any> = (
  input: TInput,
  getApi: ApiFactory
) => Promise<TOutput>;

export type CreateToolTaskHandler<TInput = any> = (
  input: TInput,
  getApi: ApiFactory,
  extra: CreateTaskRequestHandlerExtra
) => Promise<CreateTaskResult>;

export type GetToolTaskHandler<TInput = any> = (
  input: TInput,
  getApi: ApiFactory,
  extra: TaskRequestHandlerExtra
) => Promise<GetTaskResult>;

export type GetToolTaskResultHandler<TInput = any> = (
  input: TInput,
  getApi: ApiFactory,
  extra: TaskRequestHandlerExtra
) => Promise<CallToolResult>;

export interface ToolTaskRegistration<TInput = any> {
  execution: TaskToolExecution;
  handler: {
    createTask: CreateToolTaskHandler<TInput>;
    getTask: GetToolTaskHandler<TInput>;
    getTaskResult: GetToolTaskResultHandler<TInput>;
  };
}

export type PlainCallExecutionMode = 'registered' | 'direct';

/**
 * Declarative tool definition
 * All tool metadata in one place, no complex inheritance
 */
export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  title: string;
  description: string;
  requiresAuth: boolean;
  inputSchema: z.ZodSchema<TInput>;
  handler: ToolHandler<TInput, TOutput>;
  annotations?: ToolAnnotations;
  uiBinding?: ToolUiBinding<TOutput>;
  taskRegistration?: ToolTaskRegistration<TInput>;
  plainCallExecution?: PlainCallExecutionMode;
}

/**
 * MCP tool response format
 * Follows MCP protocol specification for tool responses
 */
export interface McpToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  structuredContent?: unknown;
  _meta?: Record<string, unknown>;
  /**
   * Indicates whether the tool execution resulted in an error.
   * When true, this signals to the client that the content contains error information.
   * This is a standard MCP protocol field for business-level errors.
   */
  isError?: boolean;
}

/**
 * Standardized API response
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    statusCode?: number;
  };
  metadata?: {
    userId?: string;
    timestamp?: string;
    [key: string]: any;
  };
}
