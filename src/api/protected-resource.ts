import type { Request, Response } from 'express';
import { Logger } from '../utils/logger.js';
import { RequestContextManager } from '../utils/request-context.js';

/**
 * Handle Protected Resource Metadata endpoint
 *
 * RFC 9728: OAuth 2.0 Resource Indicators
 * This endpoint provides metadata about the protected resource (MCP Server)
 * and indicates which authorization servers can issue tokens for it.
 *
 * Response format:
 * {
 *   "resource": "https://mcp.example.com",
 *   "authorization_servers": ["https://auth.example.com"],
 *   "bearer_methods_supported": ["header"],
 *   ...
 * }
 */
export const handleProtectedResourceMetadata = (req: Request, res: Response): void => {
  try {
    const protocol = process.env.NODE_ENV==='local' ? 'http' : 'https';
    const serverUrl = `${protocol}://${req.get('host')}`;

    const authServerUrl = process.env.OIDC_ISSUER;

    if (!authServerUrl) {
      Logger.error('OIDC_ISSUER environment variable is not set');
      res.status(500).json({
        error: 'server_error',
        error_description: 'Authorization server configuration is missing'
      });
      return;
    }

    Logger.debug('Serving Protected Resource Metadata', {
      meta: {
        serverUrl,
        authServerUrl,
        requestFrom: req.ip
      }
    });

    const metadata = {
      resource: `${serverUrl}/`,
      authorization_servers: [authServerUrl]
    };

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    res.json(metadata);

    Logger.debug('Protected Resource Metadata served successfully');

  } catch (error) {
    RequestContextManager.setErrorContext(error, {
      status: 500,
      source: 'handleProtectedResourceMetadata'
    });
    Logger.logError('Error serving Protected Resource Metadata', error as Error);

    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to generate protected resource metadata'
    });
  }
};
