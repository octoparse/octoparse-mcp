import Redis from 'ioredis';
import { AppConfig } from '../config/app-config.js';
import { Logger } from './logger.js';

/**
 * Redis client wrapper for distributed state management
 */
export class RedisClient {
  private static instance: Redis | null = null;
  private static isConnecting = false;

  /**
   * Get Redis client instance
   */
  public static getInstance(): Redis | null {
    const config = AppConfig.getRedisConfig();

    if (!config.enabled) {
      return null;
    }

    if (this.instance) {
      return this.instance;
    }

    return this.connect();
  }

  /**
   * Initialize Redis connection
   */
  private static connect(): Redis {
    if (this.isConnecting && this.instance) {
      return this.instance;
    }

    const config = AppConfig.getRedisConfig();
    this.isConnecting = true;

    Logger.info(`Connecting to Redis at ${config.host}:${config.port}...`);

    const redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      keyPrefix: config.keyPrefix,
      tls: config.tls ? {} : undefined,
      // Connection pool and keepalive settings to prevent idle disconnections
      keepAlive: 30000,           // Send TCP keepalive every 30 seconds
      connectTimeout: 10000,      // Connection timeout 10s
      commandTimeout: 5000,       // Command timeout 5s
      lazyConnect: false,         // Connect immediately
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      // Reconnection settings
      reconnectOnError: (err) => {
        const targetErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE'];
        const shouldReconnect = targetErrors.some(e => err.message.includes(e));
        if (shouldReconnect) {
          Logger.warn(`[Redis] Reconnecting due to error: ${err.message}`);
        }
        return shouldReconnect;
      },
    });

    redis.on('connect', () => {
      Logger.info('[Redis] ✓ Socket connected');
    });

    redis.on('ready', () => {
      Logger.info('[Redis] ✓ Server reports ready (handshake complete)');
      this.isConnecting = false;
    });

    redis.on('error', (error) => {
      Logger.error(`[Redis] Connection error: ${error.message}`);
      this.isConnecting = false;
    });

    redis.on('close', () => {
      Logger.warn('[Redis] Connection closed');
    });

    redis.on('reconnecting', () => {
      Logger.warn('[Redis] Reconnecting...');
    });

    redis.on('end', () => {
      Logger.error('[Redis] Connection ended (will not reconnect)');
      this.instance = null;
    });

    this.instance = redis;
    return redis;
  }

  /**
   * Close Redis connection
   */
  public static async close(): Promise<void> {
    if (this.instance) {
      await this.instance.quit();
      this.instance = null;
      Logger.info('Redis connection closed');
    }
  }

  /**
   * Check if Redis is enabled and connected
   */
  public static isReady(): boolean {
    return !!this.instance && this.instance.status === 'ready';
  }
}
