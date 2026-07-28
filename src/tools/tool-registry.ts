import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CreateTaskRequestHandlerExtra,
  TaskRequestHandlerExtra
} from '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js';
import { z } from 'zod';
import { OctoparseApi } from '../api/octoparse.js';
import { AppConfig } from '../config/app-config.js';
import {
  ToolDefinition,
  ToolTaskRegistration
} from './tool-definition.js';
import { buildToolExecutionLogMeta } from './tool-execution-logging.js';
import {
  handleError,
  checkAuth,
  toMcpResponse,
  createSuccessResponse
} from './middleware.js';
import { RequestContextManager } from '../utils/request-context.js';
import type { UiClientPolicy } from '../widget-adapter/ui-client-policy.js';
import { resolveUiClientPolicy } from '../widget-adapter/ui-client-policy.js';
import { buildOpenAiToolRegistrationMeta } from '../widget-adapter/openai-widget-meta.js';
import { Logger } from '../utils/logger.js';

function isApiResponseLike(value: unknown): value is { success: boolean } {
  return (
    !!value &&
    typeof value === 'object' &&
    'success' in (value as Record<string, unknown>) &&
    typeof (value as Record<string, unknown>).success === 'boolean'
  );
}

/**
 * Factory function type for creating API instances
 * Allows lazy creation of API instances with fresh tokens
 */
export type ApiFactory = () => Promise<OctoparseApi | undefined>;

type TaskOperationName = 'createTask' | 'getTask' | 'getTaskResult';

interface ToolExecutionLogSink {
  start(tool: ToolDefinition, extraMeta?: Record<string, unknown>): Promise<void>;
  success(tool: ToolDefinition, extraMeta?: Record<string, unknown>): Promise<void>;
  authRejected(tool: ToolDefinition, extraMeta?: Record<string, unknown>): Promise<void>;
  failure(tool: ToolDefinition, error: unknown, extraMeta?: Record<string, unknown>): Promise<void>;
}

function isCallToolResultLike(value: unknown): value is { content: unknown[]; isError?: boolean } {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as Record<string, unknown>).content)
  );
}

export interface ToolRegistrationOptions {
  uiPolicy?: UiClientPolicy;
  /** @deprecated Use uiPolicy. */
  uiMetaEnabled?: boolean;
}

const NOOP_TOOL_LOG_SINK: ToolExecutionLogSink = {
  start: async () => {},
  success: async () => {},
  authRejected: async () => {},
  failure: async () => {}
};

function debugIfLoggingEnabled(message: string, meta: Record<string, unknown>): void {
  const logger = Logger.getInstance();
  if (logger.transports.length === 0) {
    return;
  }

  logger.debug(message, { meta });
}

class TaskOperationAuthError extends Error {
  constructor(readonly authError: Awaited<ReturnType<typeof checkAuth>>) {
    super(authError?.error?.message ?? 'Authentication required. Please provide a valid Bearer token.');
    this.name = 'TaskOperationAuthError';
  }
}

function getToolConfig(tool: ToolDefinition, options: ToolRegistrationOptions = {}) {
  const config: any = {
    title: tool.title,
    description: tool.description,
    inputSchema: getSchemaShape(tool.inputSchema),
    annotations: tool.annotations
  };

  const allowToolRegistrationMeta =
    options.uiPolicy?.allowToolRegistrationMeta ?? options.uiMetaEnabled === true;

  if (tool.uiBinding && allowToolRegistrationMeta) {
    config._meta = buildOpenAiToolRegistrationMeta({
      title: tool.title,
      resourceUri: tool.uiBinding.resourceUri,
      outputTemplate: tool.uiBinding.outputTemplate,
      widgetAccessible: tool.uiBinding.widgetAccessible,
      invokingText: tool.uiBinding.invokingText,
      invokedText: tool.uiBinding.invokedText
    });
  };

  return config;
}

function getTaskOperationMeta(operation: TaskOperationName) {
  return {
    taskOperation: operation
  };
}

function writeToolLogContext(meta?: Record<string, unknown>): void {
  if (!meta) {
    return;
  }

  const update: Record<string, unknown> = {};
  if (meta.toolInput) {
    update.toolInput = meta.toolInput;
  }
  if (meta.toolOutput) {
    update.toolOutput = meta.toolOutput;
  }

  if (Object.keys(update).length > 0) {
    RequestContextManager.updateContext(update);
  }
}

/**
 * Create a wrapped handler with all middleware applied
 * Uses factory function for lazy API instance creation
 */
function createWrappedHandler<TInput, TOutput>(
  server: McpServer,
  tool: ToolDefinition<TInput, TOutput>,
  getApi: ApiFactory
) {
  return async (args: any): Promise<any> => {
    return executeToolWithMiddleware(tool, getApi, args, {
      logSink: NOOP_TOOL_LOG_SINK
    });
  };
}

export async function executeToolWithMiddleware<TInput, TOutput>(
  tool: ToolDefinition<TInput, TOutput>,
  getApi: ApiFactory,
  args: unknown,
  options?: {
    logSink?: ToolExecutionLogSink;
  }
): Promise<any> {
    const logSink = options?.logSink ?? NOOP_TOOL_LOG_SINK;
    // Create API instance on each request for fresh token
    const api = await getApi();
    let validInput: TInput | undefined;

    try {
      // Middleware 1: Authentication (if required)
      if (tool.requiresAuth) {
        const authError = await checkAuth(api);
        if (authError) {
          await logSink.authRejected(tool);
          return toMcpResponse(authError);
        }
      }

      // Middleware 2: Input validation
      try {
        validInput = tool.inputSchema.parse(args);
      } catch (error) {
        if (error instanceof z.ZodError) {
          const path = (e: z.ZodIssue) =>
            e.path.length > 0 ? `${e.path.join('.')}: ` : '';
          throw new Error(
            `Validation error: ${error.issues.map((e) => `${path(e)}${e.message}`).join('; ')}`
          );
        }
        throw error;
      }

      const startLogMeta = buildToolExecutionLogMeta(tool, validInput);
      writeToolLogContext(startLogMeta);
      await logSink.start(tool, startLogMeta);

      // Execute the actual handler
      const result = await tool.handler(validInput, getApi);
      const uiBinding = tool.uiBinding;
      const context = RequestContextManager.getContext();
      const uiPolicy = context?.uiPolicy ?? resolveUiClientPolicy({
        clientName: context?.clientName,
        clientVersion: context?.clientVersion
      });
      const shouldUseUiPresenter = Boolean(uiBinding && uiPolicy.allowToolResultPresenter);
      if (uiBinding) {
        debugIfLoggingEnabled('Tool UI presenter eligibility', {
          toolName: tool.name,
          clientName: context?.clientName,
          clientVersion: context?.clientVersion,
          widgetMode: uiPolicy.widgetMode,
          allowToolResultPresenter: uiPolicy.allowToolResultPresenter
        });
      }
      const presentedResult =
        shouldUseUiPresenter && !isCallToolResultLike(result)
          ? uiBinding!.presenter(result as TOutput)
          : result;

      if (isApiResponseLike(presentedResult)) {
        if (presentedResult.success) {
          const logMeta = buildToolExecutionLogMeta(tool, validInput, result, {
            success: true
          });
          writeToolLogContext(logMeta);
          await logSink.success(tool, logMeta);
        } else {
          const logMeta = buildToolExecutionLogMeta(tool, validInput, result, {
            success: false
          });
          writeToolLogContext(logMeta);
          await logSink.failure(tool, undefined, logMeta);
        }
        return toMcpResponse(presentedResult);
      }

      if (!!presentedResult && typeof presentedResult === 'object' && 'content' in (presentedResult as Record<string, unknown>)) {
        if ((presentedResult as { isError?: boolean }).isError) {
          const logMeta = buildToolExecutionLogMeta(tool, validInput, result, {
            success: false
          });
          writeToolLogContext(logMeta);
          await logSink.failure(tool, undefined, logMeta);
        } else {
          const logMeta = buildToolExecutionLogMeta(tool, validInput, result, {
            success: true
          });
          writeToolLogContext(logMeta);
          await logSink.success(tool, logMeta);
        }
        return toMcpResponse(presentedResult as any);
      }

      // Return success response
      const logMeta = buildToolExecutionLogMeta(tool, validInput, result);
      writeToolLogContext(logMeta);
      await logSink.success(tool, logMeta);
      return toMcpResponse(await createSuccessResponse(presentedResult, api));

    } catch (error) {
      const logMeta = validInput === undefined ? undefined : buildToolExecutionLogMeta(tool, validInput);
      writeToolLogContext(logMeta);
      await logSink.failure(
        tool,
        error,
        logMeta
      );

      // Handle error
      const errorResponse = await handleError(error, api);
      return toMcpResponse(errorResponse);
    }
}

export function createDefaultDirectToolLogSink(): ToolExecutionLogSink {
  return NOOP_TOOL_LOG_SINK;
}

function createWrappedTaskOperationHandler<TInput, TExtra, TResult>(
  server: McpServer,
  tool: ToolDefinition<TInput>,
  getApi: ApiFactory,
  operation: TaskOperationName,
  handler: (args: TInput, extra: TExtra) => Promise<TResult>,
  options: {
    errorMode: 'throw' | 'mcpResponse';
  }
) {
  return async (
    args: TInput,
    extra: TExtra
  ): Promise<TResult> => {
    // registerToolTask already delegates input validation to the MCP SDK before
    // invoking the wrapped task handlers, so this path should not re-parse args.
    const api = await getApi();

    try {
      writeToolLogContext(buildToolExecutionLogMeta(tool, args, undefined, getTaskOperationMeta(operation)));

      if (tool.requiresAuth) {
        const authError = await checkAuth(api);
        if (authError) {
          throw new TaskOperationAuthError(authError);
        }
      }

      const result = await handler(args, extra);
      writeToolLogContext(buildToolExecutionLogMeta(tool, args, result, getTaskOperationMeta(operation)));
      return result;
    } catch (error) {
      if (error instanceof TaskOperationAuthError) {
        if (options.errorMode === 'mcpResponse') {
          return toMcpResponse(error.authError!) as TResult;
        }

        throw new Error(error.message);
      }

      writeToolLogContext(buildToolExecutionLogMeta(tool, args, undefined, getTaskOperationMeta(operation)));
      const errorResponse = await handleError(error, api);

      if (options.errorMode === 'mcpResponse') {
        return toMcpResponse(errorResponse) as TResult;
      }

      throw new Error(errorResponse.error?.message ?? 'Unknown error');
    }
  };
}

function createWrappedTaskHandler<TInput>(
  server: McpServer,
  tool: ToolDefinition<TInput>,
  getApi: ApiFactory,
  taskRegistration: ToolTaskRegistration<TInput>
) {
  return {
    createTask: createWrappedTaskOperationHandler(
      server,
      tool,
      getApi,
      'createTask',
      (args, extra: CreateTaskRequestHandlerExtra) => taskRegistration.handler.createTask(args, getApi, extra),
      {
        errorMode: 'throw'
      }
    ),
    getTask: createWrappedTaskOperationHandler(
      server,
      tool,
      getApi,
      'getTask',
      (args, extra: TaskRequestHandlerExtra) => taskRegistration.handler.getTask(args, getApi, extra),
      {
        errorMode: 'throw'
      }
    ),
    getTaskResult: createWrappedTaskOperationHandler(
      server,
      tool,
      getApi,
      'getTaskResult',
      (args, extra: TaskRequestHandlerExtra) => taskRegistration.handler.getTaskResult(args, getApi, extra),
      {
        errorMode: 'mcpResponse'
      }
    )
  };
}

/**
 * Register a single tool on the MCP server
 * Now accepts a factory function for lazy API instance creation
 */
export function registerTool(
  server: McpServer,
  tool: ToolDefinition,
  getApi: ApiFactory,
  options: ToolRegistrationOptions = {}
): void {
  server.registerTool(
    tool.name,
    getToolConfig(tool, options),
    createWrappedHandler(server, tool, getApi)
  );
}

export function registerToolTask(
  server: McpServer,
  tool: ToolDefinition,
  getApi: ApiFactory,
  options: ToolRegistrationOptions = {}
): void {
  if (!tool.taskRegistration) {
    throw new Error(`Tool ${tool.name} is missing task registration metadata.`);
  }

  server.experimental.tasks.registerToolTask(
    tool.name,
    {
      ...getToolConfig(tool, options),
      execution: tool.taskRegistration.execution
    },
    createWrappedTaskHandler(server, tool, getApi, tool.taskRegistration)
  );
}

/**
 * Register all tools in one shot
 * Uses factory function pattern for lazy API instance creation
 */
export function registerAllTools(
  server: McpServer,
  tools: ToolDefinition[],
  getApi: ApiFactory,
  options: ToolRegistrationOptions = {}
): void {
  const taskEnabled = AppConfig.getTaskConfig().enabled;
  for (const tool of tools) {
    if (tool.taskRegistration && taskEnabled) {
      registerToolTask(server, tool, getApi, options);
      continue;
    }

    registerTool(server, tool, getApi, options);
  }
}

/**
 * Helper to get input schema shape for MCP registration
 * Handles both z.object() and other Zod schemas
 */
function getSchemaShape(schema: z.ZodSchema): any {
  const anySchema = schema as any;
  const def = anySchema._def;

  // z.preprocess / ZodEffects: inner object schema is in _def.schema (see Zod 3)
  if (def?.typeName === 'ZodEffects' && def.schema) {
    return getSchemaShape(def.schema);
  }

  if (def && def.shape) {
    if (typeof def.shape === 'function') {
      return def.shape();
    }
    return def.shape;
  }

  return {};
}
