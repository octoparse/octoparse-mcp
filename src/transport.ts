import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Logger } from './utils/logger.js';
import { AppConfig } from './config/app-config.js';

const log = Logger.createNamedLogger('octoparse.mcp.transport');

/**
 * Transport manager for handling MCP sessions
 */
export class TransportManager {
  private transports: { [key: string]: { transport: StreamableHTTPServerTransport; lastSeen: number } } = {};

  /**
   * Get transport by session ID
   */
  getTransport(sessionId: string): StreamableHTTPServerTransport | undefined {
    const entry = this.transports[sessionId];
    if (entry) {
      entry.lastSeen = Date.now();
      return entry.transport;
    }
    return undefined;
  }

  /**
   * Create a new transport and register it
   */
  createTransport(existingSessionId?: string): StreamableHTTPServerTransport {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => existingSessionId || randomUUID(),
      onsessioninitialized: (sessionId: string) => {
        log.info('Session initialized', { sessionId });
        this.transports[sessionId] = { transport, lastSeen: Date.now() };
      }
    });

    // Set up onclose handler to clean up transport when closed
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && this.transports[sid]) {
        log.info('Transport closed', { sessionId: sid });
        delete this.transports[sid];
      }
    };

    return transport;
  }

  /**
   * Manually register a recovered transport (for session recovery from Redis).
   * When recovering, onsessioninitialized is never called because we never process
   * an initialize request - so we must register explicitly.
   */
  registerTransport(sessionId: string, transport: StreamableHTTPServerTransport): void {
    const t = transport as unknown as { sessionId?: string; _initialized?: boolean };
    t.sessionId = sessionId;
    t._initialized = true;
    this.transports[sessionId] = { transport, lastSeen: Date.now() };
  }

  /**
   * Check if transport exists for session ID
   */
  hasTransport(sessionId: string): boolean {
    const entry = this.transports[sessionId];
    if (entry) {
      entry.lastSeen = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Periodic cleanup of inactive transports (e.g., sessions leaked from other instances)
   */
  cleanupInactiveTransports(maxIdleMs?: number): void {
    const idleThreshold =
      maxIdleMs ?? AppConfig.getServerConfig().transportIdleTTLSeconds * 1000;
    const now = Date.now();
    let count = 0;
    const initialCount = Object.keys(this.transports).length;

    for (const sessionId in this.transports) {
      const idleTime = now - this.transports[sessionId].lastSeen;
      if (idleTime > idleThreshold) {
        log.warn('Cleaning up stale transport', {
          sessionId,
          duration: idleTime,
          meta: {
            idleSeconds: Math.round(idleTime / 1000),
            idleThresholdSeconds: Math.round(idleThreshold / 1000)
          }
        });
        void this.transports[sessionId].transport.close().catch((error) => {
          log.logError('Failed to close stale transport cleanly', error as Error, { sessionId });
        });
        delete this.transports[sessionId];
        count++;
      }
    }

    if (count > 0) {
      log.warn('Transport cleanup removed stale entries', {
        meta: {
          removedCount: count,
          initialCount
        }
      });
    }
  }

  /**
   * Close all transports (for graceful shutdown)
   */
  async closeAllTransports(): Promise<void> {
    for (const sessionId in this.transports) {
      try {
        Logger.info(`Closing transport for session ${sessionId}`);
        await this.transports[sessionId].transport.close();
        delete this.transports[sessionId];
      } catch (error) {
        Logger.logError(`Error closing transport for session ${sessionId}:`, error as Error);
      }
    }
  }
}

// Export singleton instance
export const transportManager = new TransportManager();
