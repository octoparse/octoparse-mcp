import jwt from 'jsonwebtoken';
import { JwtPayload } from './types.js';
import { type SafeUserInfo } from '../security/jwt-support.js';
import { DataSanitizer } from '../security/jwt-support.js';
import {
  TokenProvider,
  StaticTokenProvider
} from '../auth/token-provider.js';
import { Logger } from '../utils/logger.js';

const authLog = Logger.createNamedLogger('octoparse.api.auth');

/**
 * AuthManager - Manages authentication using TokenProvider abstraction
 *
 * This class now uses TokenProvider for all token operations,
 * supporting both static tokens and dynamic token fetching.
 */
export class AuthManager {
  private tokenProvider: TokenProvider;
  private cachedUserId: string | null = null;

  /**
   * Create AuthManager with a TokenProvider
   * This is the preferred constructor for new code
   */
  constructor(tokenProvider: TokenProvider) {
    this.tokenProvider = tokenProvider;
  }

  /**
   * Backward compatible factory method
   * Creates AuthManager with static token
   */
  static createStatic(token?: string, apiKey?: string, userInfo?: SafeUserInfo): AuthManager {
    // Convert SafeUserInfo to UserInfo format
    const convertedUserInfo = userInfo ? {
      id: userInfo.userId,
      username: userInfo.username,
      email: userInfo.email,
      scope: userInfo.scope
    } : null;

    if (apiKey) {
      return new AuthManager(
        new StaticTokenProvider(apiKey, convertedUserInfo, true)
      );
    }
    if (token) {
      return new AuthManager(
        new StaticTokenProvider(token, convertedUserInfo, false)
      );
    }
    return new AuthManager(new StaticTokenProvider(null, null));
  }

  /**
   * Get authentication headers
   * Now async to support dynamic token fetching
   */
  async getAuthHeader(): Promise<Record<string, string>> {
    return this.tokenProvider.getAuthHeader();
  }

  /**
   * Get user ID from token
   * Now async to support dynamic token fetching
   * Results are cached for synchronous access
   */
  async getUserId(): Promise<string | null> {
    // Return cached value if available
    if (this.cachedUserId) {
      return this.cachedUserId;
    }

    const userInfo = await this.tokenProvider.getUserInfo();
    if (userInfo) {
      this.cachedUserId = userInfo.id;
      return this.cachedUserId;
    }

    // Fallback: extract from token
    const token = await this.tokenProvider.getToken();
    if (token) {
      try {
        const decoded = jwt.decode(token) as JwtPayload;
        if (decoded) {
          this.cachedUserId = decoded.userId || decoded.sub || decoded.user_id || decoded.id || 'unknown';
          return this.cachedUserId;
        }
      } catch (error) {
        authLog.warn('Failed to decode JWT token', {
          meta: {
            errorMessage: error instanceof Error ? error.message : 'unknown_error'
          }
        });
      }
    }

    return null;
  }

  /**
   * Get user ID synchronously (cached from previous async call)
   * Must call getUserId() at least once before using this method
   */
  getUserIdSync(): string | null {
    return this.cachedUserId;
  }

  /**
   * Get user info
   * Now async to support dynamic token fetching
   */
  async getUserInfo(): Promise<SafeUserInfo | null> {
    const userInfo = await this.tokenProvider.getUserInfo();
    if (userInfo) {
      return {
        userId: userInfo.id,
        username: userInfo.username,
        email: userInfo.email,
        scope: userInfo.scope
      };
    }
    return null;
  }

  /**
   * Check if authenticated
   * Now async to support dynamic token validation
   */
  async isAuthenticated(): Promise<boolean> {
    return this.tokenProvider.isValid();
  }


  /**
   * Check if using API Key authentication
   */
  isApiKeyAuth(): boolean {
    return this.tokenProvider.getAuthType() === 'apikey';
  }

  /**
   * Check if token is valid
   * Now async for consistency
   */
  async isTokenValid(): Promise<boolean> {
    return this.tokenProvider.isValid();
  }

  /**
   * Check if token is expiring soon
   * @param thresholdSeconds Seconds before expiration to consider as "expiring soon"
   */
  async isTokenExpiringSoon(thresholdSeconds: number = 300): Promise<boolean> {
    const token = await this.tokenProvider.getToken();
    if (!token) {
      return true; // No token = effectively expired
    }

    try {
      const decoded = jwt.decode(token) as { exp?: number } | null;
      if (!decoded?.exp) {
        return false; // No expiration claim
      }

      const expiryTime = decoded.exp * 1000;
      const threshold = Date.now() + thresholdSeconds * 1000;

      return expiryTime < threshold;
    } catch {
      return true; // Invalid token = expired
    }
  }

  /**
   * Get sanitized authentication info for logging/debugging
   * Now async for consistency
   */
  async getSanitizedAuthInfo(): Promise<Record<string, any>> {
    const authType = this.tokenProvider.getAuthType();
    const token = await this.tokenProvider.getToken();
    const userInfo = await this.tokenProvider.getUserInfo();

    return {
      authType,
      hasToken: !!token,
      hasApiKey: authType === 'apikey',
      userId: userInfo?.id,
      userInfo: userInfo ? DataSanitizer.sanitizeAccountInfo(userInfo) : undefined,
      isValid: await this.tokenProvider.isValid()
    };
  }
}
