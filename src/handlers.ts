import type { Request, Response } from 'express';
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { parseJWTToken, type UserInfo } from './auth.js';
import { createMcpServer } from './server.js';
import { transportManager } from './transport.js';
import { Logger } from './utils/logger.js';
import { RequestContextManager } from './utils/request-context.js';
import { SessionService } from './services/session-service.js';
import { computeApiKeyId } from './utils/api-key-utils.js';
import { extractApiKeyFromHeaders, hasRequestAuthCredentials } from './utils/request-auth.js';
import { executeToolDirect } from './tools.js';
import { allTools } from './tools/tool-definitions.js';
import type { ToolDefinition } from './tools/tool-definition.js';
import { emitMcpLog } from './mcp/logging-capability.js';
import {
  applyResolvedToolSelection,
  createDefaultToolSelection,
  resolveToolSelection,
  type ToolSelectionState
} from './utils/tool-selection.js';
import type { UiClientPolicy } from './widget-adapter/ui-client-policy.js';
import { resolveUiClientPolicy } from './widget-adapter/ui-client-policy.js';

const PUBLIC_TOOL_NAMES = allTools.map((tool) => tool.name);

function getToolSelectionForSession(toolSelection?: ToolSelectionState) {
  const effectiveSelection = toolSelection ?? createDefaultToolSelection(PUBLIC_TOOL_NAMES);
  return {
    toolSelection: effectiveSelection,
    selectedTools: applyResolvedToolSelection(allTools, effectiveSelection.resolvedToolNames)
  };
}

function resolveInitializeToolSelection(req: Request) {
  return resolveToolSelection(
    {
      includeTools: req.query.includeTools,
      excludeTools: req.query.excludeTools
    },
    PUBLIC_TOOL_NAMES
  );
}

function updateActiveRequestContext(partial: Parameters<typeof RequestContextManager.updateContext>[0]) {
  const currentContext = RequestContextManager.updateContext(partial);
  if (currentContext) {
    return currentContext;
  }

  return RequestContextManager.initContext({
    requestId: uuidv4(),
    correlationId: uuidv4(),
    startTime: Date.now(),
    ...partial
  });
}

function setRequestErrorContext(
  error: unknown,
  options?: {
    status?: number;
    code?: string;
    source?: string;
  }
): void {
  RequestContextManager.setErrorContext(error, options);
}

function isPlainToolCall(body: unknown): body is {
  method: 'tools/call';
  params: {
    name: string;
    arguments?: unknown;
    task?: unknown;
  };
} {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const request = body as {
    method?: unknown;
    params?: {
      name?: unknown;
      task?: unknown;
    };
  };

  return (
    request.method === 'tools/call' &&
    typeof request.params?.name === 'string' &&
    request.params?.task === undefined
  );
}

export async function maybeHandleDirectPlainToolCall(options: {
  req: Request;
  res: Response;
  requestRpcId: unknown;
  sessionId?: string;
  userInfo?: UserInfo;
  authHeaderForJwt?: string;
  apiKey?: string;
  selectedTools: ToolDefinition[];
  executeTool?: typeof executeToolDirect;
}): Promise<boolean> {
  const {
    req,
    res,
    requestRpcId,
    sessionId,
    userInfo,
    authHeaderForJwt,
    apiKey,
    selectedTools,
    executeTool = executeToolDirect
  } = options;

  if (!isPlainToolCall(req.body)) {
    return false;
  }

  const tool = selectedTools.find((candidate) => candidate.name === req.body.params.name);
  if (!tool || tool.plainCallExecution !== 'direct') {
    return false;
  }

  if (sessionId) {
    transportManager.hasTransport(sessionId);
  }

  const result = await executeTool(
    tool,
    req.body.params.arguments ?? {},
    userInfo,
    authHeaderForJwt,
    apiKey
  );

  res.status(200).json({
    jsonrpc: '2.0',
    result,
    id: requestRpcId
  });

  return true;
}

/**
 * Ensure MCP session context is available (re-hydrate if necessary for distributed deployment)
 * Note: Token is not stored in Redis. Client must provide Authorization header in every request.
 */
async function ensureSessionContext(
  sessionId: string | undefined,
  authHeader: string | undefined,
  apiKeyHeader: string | undefined
): Promise<{
  userInfo: UserInfo | undefined;
  authHeaderForJwt: string | undefined;
  apiKey: string | undefined;
  apiKeyId: string | undefined;
  toolSelection: ToolSelectionState;
  isRecovered: boolean;
  clientName?: string;
  clientVersion?: string;
  uiPolicy: UiClientPolicy;
} | null> {
  if (!sessionId) return null;

  const startTime = Date.now();

  // Determine authentication mode and validate
  let userInfo: UserInfo | undefined;
  let authType: 'jwt' | 'apiKey' | 'none' = 'none';
  const apiKey = extractApiKeyFromHeaders(authHeader, apiKeyHeader);
  const apiKeyId = apiKey ? computeApiKeyId(apiKey) : undefined;
  const authHeaderForJwt = apiKey ? undefined : authHeader;
  const hasCredentials = hasRequestAuthCredentials(authHeader, apiKeyHeader);

  if (apiKey) {
    // API Key authentication mode
    userInfo = {
      id: apiKeyId!,
      username: 'api-key-user',
      issuer: 'api-key'
    };
    authType = 'apiKey';
  } else if (authHeaderForJwt) {
    // JWT authentication mode: decode only, downstream gateway performs validation.
    userInfo = parseJWTToken(authHeaderForJwt);
    authType = 'jwt';
  }

  // Case 1: Session exists locally
  if (transportManager.hasTransport(sessionId)) {
    // Update lastSeen timestamp
    await SessionService.touchSession(sessionId);
    // Retrieve session metadata from Redis to get clientInfo
    const localMetadata = await SessionService.getSession(sessionId);
    return {
      userInfo,
      authHeaderForJwt,
      apiKey,
      apiKeyId,
      toolSelection: createDefaultToolSelection(PUBLIC_TOOL_NAMES),
      isRecovered: false,
      clientName: localMetadata?.clientInfo?.name,
      clientVersion: localMetadata?.clientInfo?.version,
      uiPolicy: resolveUiClientPolicy({
        clientName: localMetadata?.clientInfo?.name,
        clientVersion: localMetadata?.clientInfo?.version
      })
    };
  }

  // Case 2: Session does not exist locally, try to recover from Redis
  Logger.info(`[Session] Session ${sessionId} not found locally, attempting recovery from Redis...`);
  const metadata = await SessionService.getSession(sessionId);

  if (metadata) {
    // Client must provide auth credentials for recovery. Validation is delegated downstream.
    if (!hasCredentials) {
      Logger.warn(`[Session] Session ${sessionId} found in Redis but no authentication credentials were provided`);
      return null;
    }

    const recoveryTime = Date.now() - startTime;
    Logger.info(`[Session] ✓ Session ${sessionId} recovered from Redis in ${recoveryTime}ms (User: ${metadata.userId}, Auth: ${authType})`);

    try {
      const transport = transportManager.createTransport(sessionId);
      const { toolSelection, selectedTools } = getToolSelectionForSession(metadata.toolSelection);
      const recoveredUserInfo = userInfo ?? (
        metadata.userInfo
          ? {
              id: metadata.userInfo.userId,
              username: metadata.userInfo.username,
              email: metadata.userInfo.email,
              scope: metadata.userInfo.scope
            }
          : undefined
      );
      const uiPolicy = resolveUiClientPolicy({
        clientName: metadata.clientInfo?.name,
        clientVersion: metadata.clientInfo?.version
      });
      // Pass apiKey to createMcpServer for API Key authentication
      const server = createMcpServer(recoveredUserInfo, authHeaderForJwt, apiKey, selectedTools, {
        uiPolicy
      });
      await server.connect(transport);
      // Critical: onsessioninitialized is only called when processing initialize.
      // During recovery we never process initialize, so we must register manually.
      transportManager.registerTransport(sessionId, transport);

      // Update lastSeen after successful recovery
      await SessionService.touchSession(sessionId);

      await emitMcpLog(server, {
        level: 'notice',
        logger: 'octoparse.mcp.session',
        data: `Session recovered from Redis: ${sessionId}`
      }, {
        meta: {
          sessionId,
          recovered: true
        }
      });

      return {
        userInfo: recoveredUserInfo,
        authHeaderForJwt,
        apiKey,
        apiKeyId,
        toolSelection,
        isRecovered: true,
        clientName: metadata.clientInfo?.name,
        clientVersion: metadata.clientInfo?.version,
        uiPolicy
      };
    } catch (error) {
      Logger.logError(`[Session] ✗ Failed to re-initialize recovered session ${sessionId}`, error as Error);
      return null;
    }
  }

  Logger.error(`[Session] ✗ Session ${sessionId} not found in local memory or Redis`);
  return null;
}

export const handleMcpPost = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers['mcp-session-id'] as string;
  const authHeader = req.headers['authorization'] as string;
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  const requestRpcId = (req.body as { id?: unknown } | undefined)?.id ?? null;
  const apiKey = extractApiKeyFromHeaders(authHeader, apiKeyHeader);
  const authHeaderForJwt = apiKey ? undefined : authHeader;
  const hasCredentials = hasRequestAuthCredentials(authHeader, apiKeyHeader);
  const requestMethod = req.body?.method;
  const requiresAuth = requestMethod === 'initialize' || requestMethod === 'tools/call';

  let userInfo: UserInfo | undefined;
  let apiKeyId: string | undefined;
  let sessionToolSelection = createDefaultToolSelection(PUBLIC_TOOL_NAMES);
  let sessionClientName: string | undefined;
  let sessionClientVersion: string | undefined;
  let sessionUiPolicy: UiClientPolicy | undefined;

  // Check for API Key authentication first (priority over JWT)
  if (apiKey) {
    // Calculate api-key-id using SHA-1 for logging (not for authentication)
    apiKeyId = computeApiKeyId(apiKey);

    // API Key mode: trust downstream to validate, construct userInfo with apiKeyId
    userInfo = {
      id: apiKeyId,           // Use SHA-1 hash as user identifier
      username: 'api-key-user',
      issuer: 'api-key'
    };

    Logger.debug('API Key authentication detected', {
      userId: apiKeyId,
      authType: 'apiKey'
    });

    // Ensure session context with API Key support (recovery for distributed deployment)
    const sessionContext = await ensureSessionContext(sessionId, authHeader, apiKeyHeader);
    if (sessionContext?.userInfo) {
      userInfo = sessionContext.userInfo;
      apiKeyId = sessionContext.apiKeyId;
      sessionToolSelection = sessionContext.toolSelection;
      sessionClientName = sessionContext.clientName;
      sessionClientVersion = sessionContext.clientVersion;
      sessionUiPolicy = sessionContext.uiPolicy;
    }
  } else {
    // JWT authentication mode: decode only and delegate verification downstream.
    const sessionContext = await ensureSessionContext(sessionId, authHeader, apiKeyHeader);
    userInfo = sessionContext?.userInfo || parseJWTToken(authHeaderForJwt);
    sessionToolSelection = sessionContext?.toolSelection ?? sessionToolSelection;
    sessionClientName = sessionContext?.clientName;
    sessionClientVersion = sessionContext?.clientVersion;
    sessionUiPolicy = sessionContext?.uiPolicy;
  }

  // If authentication is required and credentials are missing, return 401
  if (requiresAuth && !hasCredentials) {
    // Set WWW-Authenticate header as per MCP specification
    // RFC 9728: OAuth 2.0 Resource Indicators
    // Must point to Protected Resource Metadata, NOT Authorization Server Metadata
    const resourceMetadataUrl = `${req.protocol}://${req.get('host')}/.well-known/oauth-protected-resource`;

    // Build WWW-Authenticate header (RFC 6750)
    const wwwAuthenticateHeader = [
      'Bearer',
      'realm="MCP"',
      `resource_metadata="${resourceMetadataUrl}"`,
      'error="invalid_token"',
      'error_description="Authentication required for MCP requests"',
      'scope="openid profile offline_access"'
    ].join(', ');

    res.header("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
    res.header('WWW-Authenticate', wwwAuthenticateHeader);

    // Return 401 for unauthorized requests
    // Enhanced response body with OAuth discovery information
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized',
        data: {
          // OAuth 2.0 error information
          error: 'invalid_token',
          error_description: 'Authentication required for MCP requests',

          // MCP OAuth discovery information (helps client discover OAuth config)
          oauth_discovery: {
            // Protected Resource Metadata endpoint (RFC 9728)
            resource_metadata: resourceMetadataUrl,

            // Authorization Server Metadata endpoint (RFC 8414)
            authorization_server: `${process.env.OIDC_ISSUER}/.well-known/oauth-authorization-server`,

            // Resource identifier (this MCP Server's URL)
            resource: `${req.protocol}://${req.get('host')}`,

            // Supported OAuth scopes
            scopes_supported: ['openid', 'profile', 'offline_access']
          }
        }
      },
      id: requestRpcId
    });
    return;
  }

  if (!sessionId && isInitializeRequest(req.body)) {
    const requestedToolSelection = resolveInitializeToolSelection(req);
    if (requestedToolSelection.unknownToolNames.length > 0) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32602,
          message: `Unknown tool names: ${requestedToolSelection.unknownToolNames.join(', ')}`,
          data: {
            unknownToolNames: requestedToolSelection.unknownToolNames,
            availableToolNames: PUBLIC_TOOL_NAMES
          }
        },
        id: requestRpcId
      });
      return;
    }
    sessionToolSelection = {
      includeTools: requestedToolSelection.includeTools,
      excludeTools: requestedToolSelection.excludeTools,
      resolvedToolNames: requestedToolSelection.resolvedToolNames
    };
  }

  // Run everything within the active request context established by requestLogger
  const requestContext = updateActiveRequestContext({
      token: authHeaderForJwt,
      apiKey,
      apiKeyId,
      authType: apiKey ? 'apiKey' : (userInfo?.id ? 'jwt' : undefined),
      userId: userInfo?.id,
      username: userInfo?.username,
      sessionId,
      clientName: sessionClientName,
      clientVersion: sessionClientVersion,
      uiPolicy: sessionUiPolicy ?? resolveUiClientPolicy({
        clientName: sessionClientName,
        clientVersion: sessionClientVersion
      }),
      method: req.method,
      url: req.originalUrl || req.url
    });

  await RequestContextManager.runWithContext(
    requestContext,
    async () => {
    if (sessionId) {
      Logger.debug(`Received MCP request for session: ${sessionId}`);
    } else {
      Logger.debug('New MCP request');
    }

    if (userInfo) {
      Logger.debug('Authenticated user', {
        userId: userInfo.id,
        username: userInfo.username,
        meta: {
          email: userInfo.email
        }
      });
    }

    try {
      const { selectedTools } = getToolSelectionForSession(sessionToolSelection);

      if (
        await maybeHandleDirectPlainToolCall({
          req,
          res,
          requestRpcId,
          sessionId,
          userInfo,
          authHeaderForJwt,
          apiKey,
          selectedTools
        })
      ) {
        return;
      }

      if (sessionId && transportManager.hasTransport(sessionId)) {
        // Reuse existing transport
        const transport = transportManager.getTransport(sessionId)!;
        await transport.handleRequest(req, res, req.body);

      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        const transport = transportManager.createTransport();
        const clientInfo = req.body?.params?.clientInfo;
        const clientName = clientInfo?.name;
        const clientVersion = clientInfo?.version;
        const uiPolicy = resolveUiClientPolicy({ clientName, clientVersion });
        RequestContextManager.updateContext({
          clientName,
          clientVersion,
          uiPolicy
        });
        Logger.debug('MCP client UI metadata eligibility', {
          meta: {
            clientName,
            clientVersion,
            widgetMode: uiPolicy.widgetMode,
            allowToolRegistrationMeta: uiPolicy.allowToolRegistrationMeta,
            allowToolResultPresenter: uiPolicy.allowToolResultPresenter
          }
        });

        // Connect the transport to the MCP server with user context, auth header and apiKey
        const server = createMcpServer(userInfo, authHeaderForJwt, apiKey, selectedTools, {
          uiPolicy
        });
        await server.connect(transport);

        // Process the request first - this will trigger session initialization
        await transport.handleRequest(req, res, req.body);

        // Extract client capabilities from initialize request params
        const clientCapabilities = req.body?.params?.capabilities;

        // Save session metadata to Redis for distributed support (token is NOT stored)
        // Note: transport.sessionId is only available after handleRequest processes the initialize message
        const newSessionId = transport.sessionId;
        if (newSessionId && userInfo) {
          RequestContextManager.updateContext({
            sessionId: newSessionId,
            clientName,
            clientVersion,
            uiPolicy
          });
          await SessionService.saveSession(newSessionId, {
            userId: userInfo.id,
            userInfo: {
              userId: userInfo.id,
              username: userInfo.username,
              email: userInfo.email,
              scope: userInfo.scope
            },
            createdAt: Date.now(),
            toolSelection: sessionToolSelection,
            clientCapabilities: clientCapabilities,
            clientInfo: clientName ? { name: clientName, version: clientVersion || '' } : undefined
          });
        }

      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
      }
    } catch (error) {
      setRequestErrorContext(error, {
        status: res.headersSent ? (res.statusCode >= 400 ? res.statusCode : 500) : 500,
        source: 'handleMcpPost'
      });
      Logger.logError('Error handling MCP request', error as Error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });
};

/**
 * Handle MCP GET requests for SSE streams
 */
export const handleMcpGet = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers['mcp-session-id'] as string;
  const authHeader = req.headers['authorization'] as string;
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

  Logger.debug(`MCP request path:${req.path} method: ${req.body?.method}`);

  // Try to recover session if not present locally (supports both JWT and API Key)
  const sessionContext = await ensureSessionContext(sessionId, authHeader, apiKeyHeader);
  if (!sessionContext) {
    res.status(401).send('Session not found or invalid authentication');
    return;
  }

  const requestContext = updateActiveRequestContext({
      token: sessionContext.authHeaderForJwt,
      apiKey: sessionContext.apiKey,
      apiKeyId: sessionContext.apiKeyId,
      authType: sessionContext.apiKey ? 'apiKey' : (sessionContext.userInfo?.id ? 'jwt' : undefined),
      userId: sessionContext.userInfo?.id,
      username: sessionContext.userInfo?.username,
      sessionId,
      clientName: sessionContext.clientName,
      clientVersion: sessionContext.clientVersion,
      uiPolicy: sessionContext.uiPolicy,
      method: req.method,
      url: req.originalUrl || req.url
    });

  await RequestContextManager.runWithContext(
    requestContext,
    async () => {
    if (!sessionId || !transportManager.hasTransport(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const lastEventId = req.headers['last-event-id'] as string;
    if (lastEventId) {
      Logger.info(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
    } else {
      Logger.info(`Establishing new SSE stream for session ${sessionId}`);
    }

    const transport = transportManager.getTransport(sessionId)!;
    await transport.handleRequest(req, res);
  });
};

/**
 * Handle MCP DELETE requests for session termination
 */
export const handleMcpDelete = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers['mcp-session-id'] as string;
  const authHeader = req.headers['authorization'] as string;
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

  // Try to recover session if not present locally (supports both JWT and API Key)
  const sessionContext = await ensureSessionContext(sessionId, authHeader, apiKeyHeader);
  if (!sessionContext) {
    res.status(401).send('Session not found or invalid authentication');
    return;
  }

  const requestContext = updateActiveRequestContext({
      token: sessionContext.authHeaderForJwt,
      apiKey: sessionContext.apiKey,
      apiKeyId: sessionContext.apiKeyId,
      authType: sessionContext.apiKey ? 'apiKey' : (sessionContext.userInfo?.id ? 'jwt' : undefined),
      userId: sessionContext.userInfo?.id,
      username: sessionContext.userInfo?.username,
      sessionId,
      clientName: sessionContext.clientName,
      clientVersion: sessionContext.clientVersion,
      uiPolicy: sessionContext.uiPolicy,
      method: req.method,
      url: req.originalUrl || req.url
    });

  await RequestContextManager.runWithContext(
    requestContext,
    async () => {
    if (!sessionId || !transportManager.hasTransport(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    Logger.info(`Received session termination request for session ${sessionId}`);
    try {
      // Delete session from Redis
      await SessionService.deleteSession(sessionId);

      const transport = transportManager.getTransport(sessionId)!;
      await transport.handleRequest(req, res);
    } catch (error) {
      setRequestErrorContext(error, {
        status: res.headersSent ? (res.statusCode >= 400 ? res.statusCode : 500) : 500,
        source: 'handleMcpDelete'
      });
      Logger.logError('Error handling session termination', error as Error);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  });
}


/**
 * Handle Health Check request
 */
export const handleHealthCheck = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ status: 'healthy' });
};

/**
 * Handle Liveness request
 */
export const handleLiveness = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ status: 'alive' });
};

/**
 * Handle OAuth Authorization Server Metadata endpoint
 *
 * RFC 8414: OAuth 2.0 Authorization Server Metadata
 * This endpoint proxies requests to the configured OIDC issuer's
 * authorization server metadata endpoint.
 */
export const handleOAuthAuthorizationServer = async (_req: Request, res: Response): Promise<void> => {
  try {
    const oidcIssuer = process.env.OIDC_ISSUER;

    if (!oidcIssuer) {
      Logger.error('OIDC_ISSUER environment variable is not set');
      res.status(500).json({
        error: 'server_error',
        error_description: 'Authorization server configuration is missing'
      });
      return;
    }

    // Construct target URL
    const targetUrl = `${oidcIssuer}/.well-known/oauth-authorization-server`;

    Logger.debug('Proxying OAuth Authorization Server Metadata request', {
      meta: {
        targetUrl
      }
    });

    // Forward request to OIDC issuer
    const response = await axios.get(targetUrl, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Octoparse-MCP-Server/1.0'
      },
      validateStatus: () => true
    });

    // Forward response headers
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }

    // Set cache control
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Return the response with the same status code
    res.status(response.status).json(response.data);

    Logger.debug('OAuth Authorization Server Metadata proxied successfully', {
      meta: {
        status: response.status
      }
    });

  } catch (error) {
    setRequestErrorContext(error, {
      status: 502,
      source: 'handleOAuthAuthorizationServer'
    });
    Logger.logError('Error proxying OAuth Authorization Server Metadata', error as Error);

    res.status(502).json({
      error: 'bad_gateway',
      error_description: 'Failed to fetch authorization server metadata from upstream'
    });
  }
};
