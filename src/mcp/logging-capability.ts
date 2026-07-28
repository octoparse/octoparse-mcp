import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SetLevelRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { RequestContextManager } from '../utils/request-context.js';

export interface McpLogMessage {
  level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';
  logger?: string;
  data: unknown;
  _meta?: Record<string, unknown>;
}

type McpLoggingLevel = McpLogMessage['level'];

const DEFAULT_MCP_LOG_LEVEL: McpLoggingLevel = 'info';

const LOG_LEVEL_MAP: Record<McpLoggingLevel, number> = {
  debug: 10,
  info: 20,
  notice: 30,
  warning: 40,
  error: 50,
  critical: 60,
  alert: 70,
  emergency: 80
};

interface LoggingCapabilityState {
  currentLevel: McpLoggingLevel;
  installed: boolean;
}

const loggingStateByServer = new WeakMap<McpServer, LoggingCapabilityState>();

function getOrCreateState(server: McpServer): LoggingCapabilityState {
  const existing = loggingStateByServer.get(server);
  if (existing) {
    return existing;
  }

  const created: LoggingCapabilityState = {
    currentLevel: DEFAULT_MCP_LOG_LEVEL,
    installed: false
  };
  loggingStateByServer.set(server, created);
  return created;
}

function shouldSendMessage(level: McpLoggingLevel, currentLevel: McpLoggingLevel): boolean {
  return LOG_LEVEL_MAP[level] >= LOG_LEVEL_MAP[currentLevel];
}

function buildDefaultMeta(extraMeta?: Record<string, unknown>): Record<string, unknown> | undefined {
  const context = RequestContextManager.getContext();
  const mergedMeta = {
    requestId: context?.requestId,
    correlationId: context?.correlationId,
    sessionId: context?.sessionId,
    userId: context?.userId,
    authType: context?.authType,
    ...extraMeta
  };

  const filteredEntries = Object.entries(mergedMeta).filter(([, value]) => value !== undefined);
  if (filteredEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(filteredEntries);
}

export function installLoggingCapability(server: McpServer): void {
  const state = getOrCreateState(server);
  if (state.installed) {
    return;
  }

  server.server.registerCapabilities({
    logging: {}
  });

  const originalSendLoggingMessage = server.server.sendLoggingMessage.bind(server.server);
  server.server.sendLoggingMessage = async (params) => {
    if (shouldSendMessage(params.level, state.currentLevel)) {
      await originalSendLoggingMessage(params);
    }
  };

  server.server.setRequestHandler(SetLevelRequestSchema, (request) => {
    const requestedLevel = request.params.level;
    if (requestedLevel in LOG_LEVEL_MAP) {
      state.currentLevel = requestedLevel;
    }
    return {};
  });

  state.installed = true;
}

export async function emitMcpLog(
  server: McpServer,
  message: McpLogMessage,
  options?: {
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  const params = {
    level: message.level,
    logger: message.logger,
    data: message.data,
    _meta: buildDefaultMeta({
      ...message._meta,
      ...options?.meta
    })
  };

  await server.server.sendLoggingMessage(params);
}
