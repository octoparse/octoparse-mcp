/**
 * Tool registration - Simplified Architecture with Lazy API Creation
 *
 * This file uses a declarative tool system with lazy API instance creation,
 * enabling dynamic token refresh and better resource management across
 * both regular MCP tools and task-aware MCP tool registrations.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { UserInfo } from './auth.js';
import { OctoparseApi } from './api/octoparse.js';
import { AuthManager } from './api/auth.js';
import { StaticTokenProvider } from './auth/token-provider.js';
import { RequestContextManager } from './utils/request-context.js';
import {
  createDefaultDirectToolLogSink,
  executeToolWithMiddleware,
  registerAllTools as registerAllToolsInternal,
  type ApiFactory as RegistryApiFactory,
  type ToolRegistrationOptions
} from './tools/tool-registry.js';
import { allTools } from './tools/tool-definitions.js';
import type { ToolDefinition } from './tools/tool-definition.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UiClientPolicy } from './widget-adapter/ui-client-policy.js';
import { resolveUiClientPolicy } from './widget-adapter/ui-client-policy.js';

export interface RegisterAllToolsOptions {
  clientName?: string;
  clientVersion?: string;
  uiPolicy?: UiClientPolicy;
  /** @deprecated Use uiPolicy. */
  uiMetaEnabled?: boolean;
}

function createApiFactory(
  userInfo?: UserInfo,
  authHeader?: string,
  apiKey?: string
): RegistryApiFactory {
  return async (): Promise<OctoparseApi | undefined> => {
    // First try to get token from current request context
    const context = RequestContextManager.getContext();
    const currentToken = context?.token || authHeader;
    const currentApiKey = context?.apiKey || apiKey;

    // No auth available
    if (!currentToken && !currentApiKey) {
      return undefined;
    }

    // Create token provider with current credentials
    const tokenProvider = currentApiKey
      ? new StaticTokenProvider(currentApiKey, userInfo || null, true)
      : new StaticTokenProvider(currentToken!, userInfo || null, false);

    // Create AuthManager with token provider
    const authManager = new AuthManager(tokenProvider);

    // Create and return API instance
    return new OctoparseApi(authManager);
  };
}

/**
 * Register all tools on the MCP server
 * Uses factory function pattern for lazy API instance creation
 *
 * Benefits:
 * - Fresh token on each request (supports token refresh)
 * - Lower memory footprint (no persistent API instances)
 * - Better testability
 * - Shared lazy API creation for standard and task-based tool handlers
 */
export const registerAllTools = (
  server: McpServer,
  userInfo?: UserInfo,
  authHeader?: string,
  apiKey?: string,
  selectedTools: ToolDefinition[] = allTools,
  options: RegisterAllToolsOptions = {}
): void => {
  const getApi = createApiFactory(userInfo, authHeader, apiKey);
  const uiPolicy = options.uiPolicy ?? (
    options.uiMetaEnabled !== undefined
      ? resolveUiClientPolicy({
          clientName: options.uiMetaEnabled ? 'openai-mcp' : undefined
        })
      : resolveUiClientPolicy({
          clientName: options.clientName,
          clientVersion: options.clientVersion
        })
  );
  const registryOptions: ToolRegistrationOptions = {
    uiPolicy
  };

  // Register all tools using the factory function
  registerAllToolsInternal(server, selectedTools, getApi, registryOptions);
};

export async function executeToolDirect(
  tool: ToolDefinition,
  args: unknown,
  userInfo?: UserInfo,
  authHeader?: string,
  apiKey?: string,
): Promise<CallToolResult> {
  const getApi = createApiFactory(userInfo, authHeader, apiKey);
  const context = RequestContextManager.getContext();
  if (context && !context.uiPolicy) {
    RequestContextManager.updateContext({
      uiPolicy: resolveUiClientPolicy({
        clientName: context.clientName,
        clientVersion: context.clientVersion
      })
    });
  }
  return await executeToolWithMiddleware(tool, getApi, args, {
    logSink: createDefaultDirectToolLogSink()
  }) as CallToolResult;
}

