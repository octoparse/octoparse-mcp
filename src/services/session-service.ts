import { RedisClient } from '../utils/redis.js';
import { Logger } from '../utils/logger.js';
import { AppConfig } from '../config/app-config.js';
import { type SafeUserInfo } from '../security/jwt-support.js';
import type { ToolSelectionState } from '../utils/tool-selection.js';

export interface SessionMetadata {
  userId: string;
  userInfo?: SafeUserInfo;
  createdAt: number;
  lastSeen?: number;
  toolSelection?: ToolSelectionState;
  clientCapabilities?: unknown;
  clientInfo?: {
    name: string;
    version: string;
  };
}

/**
 * Service for managing distributed session state
 */
export class SessionService {
  private static readonly SESSION_KEY_PREFIX = 'session:';

  /**
   * Get session TTL from configuration
   */
  private static getSessionTTL(): number {
    const configTTL = AppConfig.getRedisConfig().sessionTTL;
    // Ensure valid TTL (min 1 hour = 3600 seconds, default 30 days = 2592000 seconds)
    if (!configTTL || configTTL <= 0) {
      Logger.warn('[SessionService] Invalid sessionTTL from config, using default 2592000 (30 days)');
      return 2592000;
    }
    return configTTL;
  }

  /**
   * Save session metadata to Redis
   */
  public static async saveSession(sessionId: string, metadata: SessionMetadata): Promise<void> {
    const redis = RedisClient.getInstance();
    if (!redis) {
      Logger.warn(`[SessionService] Redis is disabled, skipping session persistence for ${sessionId}`);
      return;
    }

    try {
      const key = `${this.SESSION_KEY_PREFIX}${sessionId}`;
      await redis.set(
        key,
        JSON.stringify(metadata),
        'EX',
        this.getSessionTTL()
      );
      Logger.debug(`[SessionService] Successfully persisted session ${sessionId} to Redis (TTL: ${this.getSessionTTL()}s)`);
    } catch (error) {
      Logger.logError(`[SessionService] ✗ Failed to save session metadata to Redis: ${sessionId}`, error as Error);
    }
  }

  /**
   * Get session metadata from Redis
   */
  public static async getSession(sessionId: string): Promise<SessionMetadata | null> {
    const redis = RedisClient.getInstance();
    if (!redis) {
      Logger.warn(`[SessionService] Redis is disabled, cannot retrieve session metadata for ${sessionId}`);
      return null;
    }

    try {
      const key = `${this.SESSION_KEY_PREFIX}${sessionId}`;
      const data = await redis.get(key);

      if (!data) {
        Logger.warn(`[SessionService] Session metadata not found in Redis for ${sessionId}`);
        return null;
      }

      return JSON.parse(data) as SessionMetadata;
    } catch (error) {
      Logger.logError(`Failed to get session metadata from Redis: ${sessionId}`, error as Error);
      return null;
    }
  }

  /**
   * Update session's lastSeen timestamp to now
   */
  public static async touchSession(sessionId: string): Promise<void> {
    const redis = RedisClient.getInstance();
    if (!redis) return;

    try {
      const key = `${this.SESSION_KEY_PREFIX}${sessionId}`;
      const data = await redis.get(key);

      if (data) {
        const metadata = JSON.parse(data) as SessionMetadata;
        metadata.lastSeen = Date.now();
        await redis.set(
          key,
          JSON.stringify(metadata),
          'EX',
          this.getSessionTTL()
        );
        Logger.debug(`[SessionService] Updated lastSeen for session ${sessionId}`);
      }
    } catch (error) {
      Logger.logError(`[SessionService] Failed to update lastSeen for session: ${sessionId}`, error as Error);
    }
  }

  /**
   * Delete session metadata from Redis
   */
  public static async deleteSession(sessionId: string): Promise<void> {
    const redis = RedisClient.getInstance();
    if (!redis) return;

    try {
      const key = `${this.SESSION_KEY_PREFIX}${sessionId}`;
      await redis.del(key);
      Logger.debug(`Deleted session metadata from Redis: ${sessionId}`);
    } catch (error) {
      Logger.logError(`Failed to delete session metadata from Redis: ${sessionId}`, error as Error);
    }
  }
}
