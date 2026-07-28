export interface JwtPayload {
  sub?: string;
  userId?: string;
  username?: string;
  email?: string;
  iss?: string;
  scope?: string | string[];
  rule?: any;
  exp?: number;
  iat?: number;
  [key: string]: any;
}

/**
 * Safe user information (without sensitive data)
 */
export interface SafeUserInfo {
  userId: string;
  username?: string;
  email?: string;
  scope?: string | string[];
}

/**
 * Data sanitizer for removing sensitive information
 */
export class DataSanitizer {
  /**
   * Remove sensitive fields from account information
   */
  static sanitizeAccountInfo(accountInfo: any): any {
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'credential',
      'internalId', 'systemId', 'adminFlag', 'permissions'
    ];

    const sanitized = { ...accountInfo };

    Object.keys(sanitized).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (sensitiveFields.some(sensitive => lowerKey.includes(sensitive))) {
        delete sanitized[key];
      }
    });

    return sanitized;
  }

  /**
   * Sanitize error messages to prevent information leakage
   */
  static sanitizeErrorMessage(error: string): string {
    return error
      .replace(/\/[a-zA-Z0-9\/\._-]+\.(js|ts|json)/g, '[file]')
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[uuid]')
      .replace(/\b[A-Za-z0-9+/]{20,}={0,2}\b/g, '[token]');
  }
}
