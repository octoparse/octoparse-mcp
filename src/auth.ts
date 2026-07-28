import jwt from 'jsonwebtoken';
import { Logger } from './utils/logger.js';
import { type JwtPayload } from './security/jwt-support.js';

export interface UserInfo {
  id: string;
  username?: string;
  email?: string;
  issuer?: string;
  scope?: string | string[];
  rule?: any;
  [key: string]: any;
}

/**
 * Parse JWT token from Authorization header and extract user information
 * This function decodes the token without local verification.
 * Downstream services remain responsible for token validation.
 * @param authHeader - Authorization header value (should start with 'Bearer ')
 * @returns UserInfo object if valid token format, undefined otherwise
 */
export const parseJWTToken = (authHeader?: string): UserInfo | undefined => {
  try {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return undefined;
    }

    const token = authHeader.substring(7);

    // Only decode without verification - for non-critical operations only
    const decoded = jwt.decode(token) as any;

    if (!decoded || typeof decoded !== 'object') {
      return undefined;
    }

    // Extract common JWT claims
    const userInfo: UserInfo = {
      id: decoded.sub || decoded.id || decoded.userId || 'unknown',
      username: decoded.username || decoded.name || decoded.preferred_username,
      email: decoded.email,
      issuer: decoded.iss,
      scope: decoded.scope,
      rule: decoded.rule
    };

    return userInfo;
  } catch (error) {
    Logger.logError('Error parsing JWT token', error as Error);
    return undefined;
  }
};

/**
 * Extract token expiration time from Authorization header
 * @param authHeader - Authorization header value
 * @returns Expiration timestamp in seconds, or undefined if not present
 */
export const getTokenExpiration = (authHeader?: string): number | undefined => {
  try {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return undefined;
    }

    const token = authHeader.substring(7);
    const payload = jwt.decode(token) as JwtPayload;

    return payload?.exp;
  } catch {
    return undefined;
  }
};

/**
 * Check if token from Authorization header is expired (without signature verification)
 * @param authHeader - Authorization header value
 * @returns true if expired or invalid, false if not expired or no exp claim
 */
export const isTokenExpired = (authHeader?: string): boolean => {
  try {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return true;
    }

    const token = authHeader.substring(7);
    const payload = jwt.decode(token) as JwtPayload;

    if (!payload?.exp) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
  } catch {
    return true;
  }
};
