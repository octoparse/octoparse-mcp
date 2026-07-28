/**
 * Token Provider Interface
 *
 * Abstracts token acquisition logic, supporting:
 * 1. Static token (existing behavior)
 * 2. Dynamic token (supports refresh)
 * 3. Request-level token (fetched from RequestContext)
 */

import type { UserInfo } from '../auth.js';

/**
 * Authentication type
 */
export type AuthType = 'jwt' | 'apikey' | 'none';

/**
 * Token Provider Interface
 * All methods are async to support dynamic token fetching
 */
export interface TokenProvider {
  /**
   * Get current valid token
   * Returns null if no token available or token invalid
   */
  getToken(): Promise<string | null>;

  /**
   * Get user information
   */
  getUserInfo(): Promise<UserInfo | null>;

  /**
   * Check if credentials are present.
   * Local JWT verification is intentionally skipped; downstream gateway validates tokens.
   */
  isValid(): Promise<boolean>;

  /**
   * Get authentication type
   */
  getAuthType(): AuthType;

  /**
   * Get authentication headers
   * Returns appropriate headers based on auth type
   */
  getAuthHeader(): Promise<Record<string, string>>;
}

/**
 * Static Token Provider
 * Used for traditional JWT or API Key mode
 * Token is set at construction time and doesn't change
 */
export class StaticTokenProvider implements TokenProvider {
  private token: string | null = null;
  private apiKey: string | null = null;
  private userInfo: UserInfo | null = null;
  private authType: AuthType = 'none';

  constructor(
    tokenOrApiKey: string | null | undefined,
    userInfo: UserInfo | null,
    isApiKey: boolean = false
  ) {
    if (isApiKey && tokenOrApiKey) {
      this.apiKey = tokenOrApiKey;
      this.authType = 'apikey';
      this.userInfo = userInfo;
    } else if (tokenOrApiKey) {
      this.token = tokenOrApiKey;
      this.authType = 'jwt';
      this.userInfo = userInfo;
    }
  }

  async getToken(): Promise<string | null> {
    if (this.authType === 'jwt') {
      return this.token;
    }
    return null;
  }

  async getUserInfo(): Promise<UserInfo | null> {
    return this.userInfo;
  }

  async isValid(): Promise<boolean> {
    if (this.authType === 'apikey') {
      return !!this.apiKey;
    }
    if (this.authType === 'jwt' && this.token) {
      return true;
    }
    return false;
  }

  getAuthType(): AuthType {
    return this.authType;
  }

  async getAuthHeader(): Promise<Record<string, string>> {
    if (this.authType === 'apikey' && this.apiKey) {
      return { 'X-API-Key': this.apiKey };
    }
    const token = await this.getToken();
    if (token) {
      return { 'Authorization': `${token}` };
    }
    return {};
  }

  /**
   * Get API key (for API Key auth type)
   */
  getApiKey(): string | null {
    return this.apiKey;
  }
}

/**
 * Request Token Provider
 * Fetches token from current request context
 * Supports dynamic token changes per request
 */
export class RequestTokenProvider implements TokenProvider {
  constructor(
    private tokenExtractor: () => string | undefined,
    private apiKeyExtractor: () => string | undefined,
    private userInfoExtractor: () => UserInfo | undefined
  ) {}

  async getToken(): Promise<string | null> {
    return this.tokenExtractor() || null;
  }

  async getUserInfo(): Promise<UserInfo | null> {
    return this.userInfoExtractor() || null;
  }

  async isValid(): Promise<boolean> {
    const token = await this.getToken();
    const apiKey = this.apiKeyExtractor();

    if (apiKey) {
      return true;
    }

    if (token) {
      return true;
    }

    return false;
  }

  getAuthType(): AuthType {
    if (this.apiKeyExtractor()) {
      return 'apikey';
    }
    if (this.tokenExtractor()) {
      return 'jwt';
    }
    return 'none';
  }

  async getAuthHeader(): Promise<Record<string, string>> {
    const apiKey = this.apiKeyExtractor();
    if (apiKey) {
      return { 'X-API-Key': apiKey };
    }

    const token = await this.getToken();
    if (token) {
      return { 'Authorization': `${token}` };
    }

    return {};
  }
}

/**
 * Factory function type for creating TokenProvider
 */
export type TokenProviderFactory = () => TokenProvider;
