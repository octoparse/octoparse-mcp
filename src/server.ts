import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from './tools.js';
import { registerAllResources } from './resources.js';
import type { UserInfo } from './auth.js';
import { AppConfig } from './config/app-config.js';
import type { ToolDefinition } from './tools/tool-definition.js';
import { installLoggingCapability } from './mcp/logging-capability.js';
import {
  createExecutionTaskStore,
  type ExecutionTaskStore
} from './tasks/execution-task-store.js';
import type { UiClientPolicy } from './widget-adapter/ui-client-policy.js';
import { resolveUiClientPolicy } from './widget-adapter/ui-client-policy.js';

const executionTaskStoreByPrincipal = new Map<string, ExecutionTaskStore>();

function resolveExecutionTaskStore(
  userInfo?: UserInfo,
  defaultPollInterval?: number
): ExecutionTaskStore {
  const principalId = typeof userInfo?.id === 'string' ? userInfo.id.trim() : '';

  // Anonymous server instances must not share task state.
  if (principalId.length === 0) {
    return createExecutionTaskStore({
      ...(defaultPollInterval !== undefined ? { defaultPollInterval } : {})
    });
  }

  const existing = executionTaskStoreByPrincipal.get(principalId);
  if (existing) {
    return existing;
  }

  const created = createExecutionTaskStore({
    ...(defaultPollInterval !== undefined ? { defaultPollInterval } : {})
  });
  executionTaskStoreByPrincipal.set(principalId, created);
  return created;
}

/**
 * Create and configure MCP server with user context
 * @param userInfo - Optional user information from JWT token or API Key
 * @param authHeader - Optional authorization header for API calls
 * @param apiKey - Optional API Key for authentication
 * @param selectedTools - Optional subset of public tools to expose for this session
 * @returns Configured McpServer instance
 */
export const createMcpServer = (
  userInfo?: UserInfo,
  authHeader?: string,
  apiKey?: string,
  selectedTools?: ToolDefinition[],
  options: {
    uiPolicy?: UiClientPolicy;
    /** @deprecated Use uiPolicy. */
    uiMetaEnabled?: boolean;
  } = {}
): McpServer => {
  const serverConfig = AppConfig.getServerConfig();
  const taskConfig = AppConfig.getTaskConfig();
  const taskStore = resolveExecutionTaskStore(userInfo, taskConfig.pollIntervalMs);
  const server = new McpServer(
    {
      name: serverConfig.name,
      version: serverConfig.version
    },
    {
      capabilities: {
        logging: {},
        ...(taskConfig.enabled
          ? {
              tasks: {
                list: {},
                cancel: {},
                requests: {
                  tools: {
                    call: {}
                  }
                }
              }
            }
          : {})
      },
      taskStore
    }
  );

  installLoggingCapability(server);
  const uiPolicy = options.uiPolicy ?? (
    options.uiMetaEnabled !== undefined
      ? resolveUiClientPolicy({
          clientName: options.uiMetaEnabled ? 'openai-mcp' : undefined
        })
      : resolveUiClientPolicy()
  );

  // Register all tools with user context, auth header and apiKey
  registerAllTools(server, userInfo, authHeader, apiKey, selectedTools, {
    uiPolicy
  });

  // Register all resources
  registerAllResources(server, {
    uiPolicy
  });

  return server;
};
