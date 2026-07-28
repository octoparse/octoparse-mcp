import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { OctoparseApiError } from '../types.js';
import { AuthManager } from '../auth.js';
import { AppConfig } from '../../config/app-config.js';
import { Logger } from '../../utils/logger.js';
import * as http from 'http';
import * as https from 'https';

/**
 * Connection pool configuration for optimal HTTP performance
 */
const CONNECTION_POOL_CONFIG = {
  // Keep-alive settings
  keepAlive: true,
  keepAliveMsecs: 30000, // 30 seconds
  maxSockets: 50,        // Max sockets per host
  maxFreeSockets: 10,    // Max free sockets per host
  timeout: 60000,        // Connection timeout
  freeSocketTimeout: 15000 // Free socket timeout
};

const OCTOPARSE_CLIENT_HEADER_VALUE = 'mcp';
const RETRYABLE_STATUS_CODES = new Set([408, 409, 429]);
const log = Logger.createNamedLogger('octoparse.api.http');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Base HTTP client with optimized connection pooling
 *
 * Design (Scheme C):
 * - Caches axios instances per user (by userId) to ensure credential isolation
 * - Sets up interceptors only once per instance
 * - Passes authManager explicitly through request config
 */
export abstract class BaseHttpClient {
  protected client: AxiosInstance;
  protected authManager: AuthManager;
  protected baseURL: string;
  protected static connectionPools = new Map<string, AxiosInstance>();
  private static configuredClients = new WeakSet<AxiosInstance>();

  constructor(baseURL: string, authManager: AuthManager) {
    this.baseURL = baseURL;
    this.authManager = authManager;

    // Generate user-specific cache key for credential isolation.
    const userId = this.getUserCacheKey(authManager);
    const cacheKey = `${baseURL}#${userId}`;
    const isNewClient = !BaseHttpClient.connectionPools.has(cacheKey);

    this.client = this.getOrCreateClient(cacheKey, baseURL);

    if (isNewClient) {
      this.setupInterceptors();
    }
  }

  /**
   * Generate cache key component from authManager.
   * Uses userId if available, otherwise falls back to anonymous.
   */
  private getUserCacheKey(authManager: AuthManager): string {
    const userId = authManager.getUserIdSync();
    if (userId) {
      return userId;
    }

    if (authManager.isApiKeyAuth()) {
      return 'apikey-user';
    }

    return `anonymous_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Get or create axios instance with connection pooling.
   */
  protected getOrCreateClient(cacheKey: string, baseURL: string): AxiosInstance {
    if (BaseHttpClient.connectionPools.has(cacheKey)) {
      return BaseHttpClient.connectionPools.get(cacheKey)!;
    }

    const client = this.createOptimizedClient(baseURL);
    BaseHttpClient.connectionPools.set(cacheKey, client);
    return client;
  }

  /**
   * Create optimized axios instance with connection pooling.
   */
  protected createOptimizedClient(baseURL: string): AxiosInstance {
    const httpConfig = AppConfig.getHttpConfig();

    let httpAgent: any = undefined;
    let httpsAgent: any = undefined;

    if (typeof window === 'undefined') {
      httpAgent = new http.Agent({
        keepAlive: CONNECTION_POOL_CONFIG.keepAlive,
        keepAliveMsecs: CONNECTION_POOL_CONFIG.keepAliveMsecs,
        maxSockets: CONNECTION_POOL_CONFIG.maxSockets,
        maxFreeSockets: CONNECTION_POOL_CONFIG.maxFreeSockets,
        timeout: CONNECTION_POOL_CONFIG.timeout
      });

      httpsAgent = new https.Agent({
        keepAlive: CONNECTION_POOL_CONFIG.keepAlive,
        keepAliveMsecs: CONNECTION_POOL_CONFIG.keepAliveMsecs,
        maxSockets: CONNECTION_POOL_CONFIG.maxSockets,
        maxFreeSockets: CONNECTION_POOL_CONFIG.maxFreeSockets,
        timeout: CONNECTION_POOL_CONFIG.timeout
      });
    }

    return axios.create({
      baseURL,
      timeout: httpConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': httpConfig.userAgent || 'Octoparse-MCP-Server/1.0',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      httpAgent,
      httpsAgent,
      decompress: true,
      maxRedirects: httpConfig.maxRedirects || 5,
      validateStatus: (status) => status < 500
    });
  }

  /**
   * Setup optimized request and response interceptors.
   * Auth info is read from request config to support per-user instances.
   */
  protected setupInterceptors(): void {
    if (BaseHttpClient.configuredClients.has(this.client)) {
      return;
    }

    this.client.interceptors.request.use(
      async (config) => {
        config.headers = {
          ...config.headers,
          'x-client': OCTOPARSE_CLIENT_HEADER_VALUE
        } as any;

        const authManager = (config as any).authManager as AuthManager | undefined;
        if (authManager && await authManager.isAuthenticated()) {
          const authHeader = await authManager.getAuthHeader();
          config.headers = { ...config.headers, ...authHeader } as any;
        }

        (config as any).metadata = { startTime: Date.now() };
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - ((response.config as any).metadata?.startTime || Date.now());

        if (AppConfig.isDevelopment() && duration > 1000) {
          log.warn('Slow upstream request detected', {
            duration,
            meta: {
              url: response.config.url,
              method: response.config.method
            }
          });
        }

        return response;
      },
      (error) => Promise.reject(this.handleError(error))
    );

    BaseHttpClient.configuredClients.add(this.client);
  }

  /**
   * Enhanced error handling with retry logic.
   */
  protected handleError(error: AxiosError): OctoparseApiError {
    if (error.response) {
      return this.createApiErrorFromResponse(error.response);
    }

    if (error.request) {
      return new OctoparseApiError(
        'NETWORK_ERROR',
        'Network request failed - please check your internet connection',
        0
      );
    }

    return new OctoparseApiError(
      'UNKNOWN_ERROR',
      error.message || 'An unknown error occurred',
      0
    );
  }

  private createApiErrorFromResponse<T>(response: AxiosResponse<T>): OctoparseApiError {
    const status = response.status;
    const data = response.data as any;

    if (data && typeof data === 'object' && (data.error || data.error_Description || data.error_description)) {
      return new OctoparseApiError(
        data.error,
        data.error_Description || data.error_description,
        status
      );
    }

    return new OctoparseApiError(
      `HTTP_${status}`,
      `HTTP ${status}: ${response.statusText || 'Request failed'}`,
      status
    );
  }

  public async getUserId(): Promise<string | null> {
    return this.authManager.getUserId();
  }

  public async isAuthenticated(): Promise<boolean> {
    return this.authManager.isAuthenticated();
  }

  private buildRequestConfig(
    params?: Record<string, any>,
    headers?: Record<string, string>
  ): AxiosRequestConfig {
    return {
      ...(params ? { params } : {}),
      ...(headers ? { headers } : {}),
      authManager: this.authManager
    } as AxiosRequestConfig;
  }

  private shouldRetry(error: unknown): error is OctoparseApiError {
    if (!(error instanceof OctoparseApiError)) {
      return false;
    }

    if (!error.statusCode || error.statusCode === 0) {
      return true;
    }

    return error.statusCode >= 500 || RETRYABLE_STATUS_CODES.has(error.statusCode);
  }

  private async requestWithRetry<T>(request: () => Promise<AxiosResponse<T>>): Promise<T> {
    const httpConfig = AppConfig.getHttpConfig();
    const maxAttempts = Math.max(1, httpConfig.retries + 1);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await request();

        if (response.status >= 400) {
          throw this.createApiErrorFromResponse(response);
        }

        return response.data;
      } catch (error) {
        if (!this.shouldRetry(error) || attempt >= maxAttempts) {
          throw error;
        }

        const delay = Math.min(httpConfig.retryDelay * 2 ** (attempt - 1), 10_000);
        log.warn('Retrying upstream request after transient failure', {
          meta: {
            attempt,
            maxAttempts,
            delayMs: delay,
            errorCode: error.code,
            statusCode: error.statusCode
          }
        });
        await sleep(delay);
      }
    }

    throw new OctoparseApiError('UNKNOWN_ERROR', 'Request retry loop exited unexpectedly', 0);
  }

  public async get<T>(url: string, params?: Record<string, any>, headers?: Record<string, string>): Promise<T> {
    return this.requestWithRetry(async () =>
      this.client.get<T>(url, this.buildRequestConfig(params, headers))
    );
  }

  public async post<T>(url: string, data?: any): Promise<T> {
    return this.requestWithRetry(async () =>
      this.client.post<T>(url, data, this.buildRequestConfig())
    );
  }

  public async put<T>(url: string, data?: any): Promise<T> {
    return this.requestWithRetry(async () =>
      this.client.put<T>(url, data, this.buildRequestConfig())
    );
  }

  public async delete<T>(url: string): Promise<T> {
    return this.requestWithRetry(async () =>
      this.client.delete<T>(url, this.buildRequestConfig())
    );
  }

  /**
   * Get connection pool statistics.
   */
  public static getPoolStats(): {
    totalPools: number;
    poolUrls: string[];
  } {
    return {
      totalPools: BaseHttpClient.connectionPools.size,
      poolUrls: Array.from(BaseHttpClient.connectionPools.keys())
    };
  }

  /**
   * Clear connection pools (for testing or cleanup).
   */
  public static clearPools(): void {
    BaseHttpClient.connectionPools.clear();
  }
}

/**
 * ClientAPI client for Octoparse task management APIs
 */
export class ClientApiClient extends BaseHttpClient {
  constructor(authManager: AuthManager) {
    const apiConfig = AppConfig.getApiConfig();
    super(apiConfig.clientApi, authManager);
  }
}

/**
 * HTTP Client Factory for creating appropriate client instances with connection pooling
 *
 * Now creates clients with AuthManager for dynamic token support.
 * Connection pooling is handled at the BaseHttpClient level.
 */
export class HttpClientFactory {
  /**
   * Create a new ClientAPI client instance with AuthManager
   */
  static getClientApiClient(authManager: AuthManager): ClientApiClient {
    return new ClientApiClient(authManager);
  }

  /**
   * Clear connection pools (useful for testing or cleanup)
   */
  static clearCache(): void {
    BaseHttpClient.clearPools();
  }

  /**
   * Get connection pool statistics
   */
  static getPerformanceStats(): {
    connectionPools: ReturnType<typeof BaseHttpClient.getPoolStats>;
  } {
    return {
      connectionPools: BaseHttpClient.getPoolStats()
    };
  }
}
