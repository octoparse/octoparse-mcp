import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { handleMcpPost, handleMcpGet, handleMcpDelete, handleHealthCheck, handleLiveness, handleOAuthAuthorizationServer } from './handlers.js';
import { handleProtectedResourceMetadata } from './api/protected-resource.js';
import { transportManager } from './transport.js';
import { AppConfig } from './config/app-config.js';
import { Logger } from './utils/logger.js';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler, setupProcessErrorHandlers } from './middleware/error-handler.js';

const startupMessages: Array<{ level: 'info' | 'warn'; message: string }> = [];

/**
 * Load environment configuration
 *
 * Priority:
 * 1. Existing process.env values
 * 2. ENV_FILE if provided
 * 3. Fallback to .env if present
 *
 * In Docker/K8s we often inject env vars directly, so missing files should not
 * be fatal. We only warn if the specified file cannot be found and continue
 * with existing process.env.
 */
function loadEnvironmentConfig(): void {
  const cwd = process.cwd();

  // Highest priority: explicit ENV_FILE
  const envFileFromEnv = process.env.ENV_FILE?.trim();
  let envFileToLoad: string | null = envFileFromEnv || null;

  // Fallback: use .env if present
  if (!envFileToLoad && fs.existsSync(path.resolve(cwd, '.env'))) {
    envFileToLoad = '.env';
  }

  // If no env file determined, rely on existing process.env (common in Docker)
  if (!envFileToLoad) {
    startupMessages.push({
      level: 'warn',
      message: 'No ENV_FILE provided and .env not found. Using existing environment variables.'
    });
    return;
  }

  const envPath = path.resolve(cwd, envFileToLoad);
  if (!fs.existsSync(envPath)) {
    startupMessages.push({
      level: 'warn',
      message: `Environment file ${envFileToLoad} not found. Using existing environment variables.`
    });
    return;
  }

  dotenv.config({ path: envPath, override: false });
  startupMessages.push({
    level: 'info',
    message: `Loaded environment variables from: ${envFileToLoad}`
  });
  startupMessages.push({
    level: 'info',
    message: `NODE_ENV: ${process.env.NODE_ENV || 'not set'}`
  });
}

// Load environment configuration before anything else
loadEnvironmentConfig();

// Reset AppConfig instance to ensure it reads the newly loaded environment variables
// This is necessary because AppConfig may have been initialized during module import
// before environment variables were loaded
AppConfig.reset();
Logger.reset();

const startupLog = Logger.createNamedLogger('octoparse.startup');
for (const entry of startupMessages) {
  startupLog[entry.level](entry.message);
}

// Load configuration from environment variables (after environment is loaded)
const config = AppConfig.getConfig();

// Validate configuration after environment variables are loaded
try {
  AppConfig.validateConfig();
} catch (error) {
  startupLog.error('Configuration validation failed', {
    error: error instanceof Error ? error : undefined,
    meta: {
      errorMessage: error instanceof Error ? error.message : String(error)
    }
  });
  if (AppConfig.isProduction()) {
    process.exit(1);
  }
}
const HOST = config.server.host;
const PORT = config.server.port;
const TRANSPORT_CLEANUP_INTERVAL_MS = config.server.transportCleanupIntervalSeconds * 1000;

// Create Express app
const app = express();

// Configure trust proxy for real IP extraction
const securityConfig = AppConfig.getSecurityConfig();
if (securityConfig.trustProxy) {
  app.set('trust proxy', true);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: securityConfig.allowedOrigins,
  exposedHeaders: ["Mcp-Session-Id"]
}));
app.use('/openai-app', express.static(path.resolve(process.cwd(), 'web', 'dist')));

// Register request logger middleware to log all incoming requests and responses
app.use(requestLogger);

// Register MCP routes
app.post('/', handleMcpPost);
app.get('/', handleMcpGet);
app.delete('/', handleMcpDelete);

// Register protected resource metadata endpoint
app.get('/.well-known/oauth-protected-resource', handleProtectedResourceMetadata);

// Register OAuth Authorization Server metadata endpoint
app.get('/.well-known/oauth-authorization-server', handleOAuthAuthorizationServer);

// Register K8s probes
app.get('/hc', handleHealthCheck);
app.get('/liveness', handleLiveness);

// Global error handling middleware - must be registered after all routes
app.use(errorHandler);

// Setup process-level error handlers
setupProcessErrorHandlers();

// Start server
app.listen(PORT, HOST, () => {
  Logger.info(`MCP Server started successfully!`);
  Logger.info(`Server: ${config.server.name} v${config.server.version}`);
  Logger.info(`Environment: ${config.server.environment}`);
  Logger.info(`Server listening on: http://${HOST}:${PORT}`);
  Logger.info(`MCP endpoint: http://${HOST}:${PORT}`);

  const cleanupTimer = setInterval(() => {
    transportManager.cleanupInactiveTransports();
  }, TRANSPORT_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  Logger.info('Shutting down server...');

  // Close all active transports
  await transportManager.closeAllTransports();

  Logger.info('Server shutdown complete');
  process.exit(0);
});
