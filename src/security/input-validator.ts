import { z } from 'zod';

/**
 * Enhanced input validation with security checks
 * Provides protection against injection attacks and malicious input
 */
export class InputValidator {
  private static readonly MAX_STRING_LENGTH = 10000;
  private static readonly MAX_ARRAY_LENGTH = 1000;
  private static readonly MAX_OBJECT_DEPTH = 10;
  
  // Common injection patterns to detect
  private static readonly INJECTION_PATTERNS = [
    // SQL injection patterns
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|OR|AND)\b)/i,
    /('|"|;|--|\*|\/\*|\*\/|\||\||&&)/,
    
    // Script injection patterns
    /<script[^>]*>.*?<\/script>/i,
    /javascript:/i,
    /on\w+\s*=/i,
    
    // Path traversal patterns
    /\.\.[\/\\]/,
    /[\/\\]\.\.$/,
    
    // Command injection patterns
    /[;&|`$(){}[\]]/,
    
    // LDAP injection patterns
    /[()&|!]/,
    
    // XPath injection patterns
    /['"()\[\]]/
  ];

  /**
   * Enhanced string validation with security checks
   */
  static createSecureString(maxLength?: number) {
    const max = maxLength || this.MAX_STRING_LENGTH;
    
    return z.string()
      .max(max, `String length must not exceed ${max} characters`)
      .refine(
        (value) => this.validateStringContent(value),
        'String contains potentially malicious content'
      )
      .transform((value) => this.sanitizeString(value));
  }

  /**
   * Enhanced number validation with range checks
   */
  static createSecureNumber(min?: number, max?: number) {
    let schema = z.number()
      .finite('Number must be finite')
      .safe('Number must be within safe integer range');
    
    if (min !== undefined) {
      schema = schema.min(min, `Number must be at least ${min}`);
    }
    
    if (max !== undefined) {
      schema = schema.max(max, `Number must not exceed ${max}`);
    }
    
    return schema;
  }

  /**
   * Enhanced array validation with size limits
   */
  static createSecureArray<T>(elementSchema: z.ZodSchema<T>, maxLength?: number) {
    const max = maxLength || this.MAX_ARRAY_LENGTH;
    
    return z.array(elementSchema)
      .max(max, `Array length must not exceed ${max} elements`)
      .refine(
        (value) => this.validateArrayDepth(value, 0),
        `Array nesting exceeds maximum depth of ${this.MAX_OBJECT_DEPTH}`
      );
  }

  /**
   * Enhanced object validation with depth checks
   */
  static createSecureObject<T extends z.ZodRawShape>(shape: T) {
    return z.object(shape)
      .refine(
        (value) => this.validateObjectDepth(value, 0),
        `Object nesting exceeds maximum depth of ${this.MAX_OBJECT_DEPTH}`
      );
  }

  /**
   * Validate string content for injection patterns
   */
  private static validateStringContent(value: string): boolean {
    // Check for common injection patterns
    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        return false;
      }
    }
    
    // Check for suspicious character sequences
    if (this.containsSuspiciousSequences(value)) {
      return false;
    }
    
    // Check for excessive special characters
    if (this.hasExcessiveSpecialChars(value)) {
      return false;
    }
    
    return true;
  }

  /**
   * Search queries should allow natural-language Unicode text such as Chinese task names.
   * Keep injection and suspicious-sequence checks, but do not treat letters/numbers outside ASCII
   * or common search separators as "special characters".
   */
  private static validateSearchQueryContent(value: string): boolean {
    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        return false;
      }
    }

    if (this.containsSuspiciousSequences(value)) {
      return false;
    }

    if (
      this.hasExcessiveSpecialChars(value, {
        allowUnicodeLettersAndNumbers: true,
        allowedExtraChars: '-_'
      })
    ) {
      return false;
    }

    return true;
  }

  /**
   * Sanitize string input
   */
  private static sanitizeString(value: string): string {
    return value
      .trim()
      // Remove null bytes
      .replace(/\0/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove control characters except newlines and tabs
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  /**
   * Check for suspicious character sequences
   */
  private static containsSuspiciousSequences(value: string): boolean {
    // Multiple consecutive special characters
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\?]{5,}/.test(value)) {
      return true;
    }
    
    // Repeated patterns that might indicate injection
    if (/(.{2,})\1{3,}/.test(value)) {
      return true;
    }
    
    // Base64-like strings that might hide payloads
    if (/^[A-Za-z0-9+\/]{50,}={0,2}$/.test(value)) {
      return true;
    }
    
    return false;
  }

  /**
   * Check for excessive special characters
   */
  private static hasExcessiveSpecialChars(
    value: string,
    options?: {
      allowUnicodeLettersAndNumbers?: boolean;
      allowedExtraChars?: string;
    }
  ): boolean {
    const escapedExtraChars = (options?.allowedExtraChars || '').replace(
      /[-/\\^$*+?.()|[\]{}]/g,
      '\\$&'
    );
    const baseClass = options?.allowUnicodeLettersAndNumbers
      ? `[^\\p{L}\\p{N}\\s${escapedExtraChars}]`
      : `[^a-zA-Z0-9\\s${escapedExtraChars}]`;
    const specialCharPattern = new RegExp(baseClass, options?.allowUnicodeLettersAndNumbers ? 'gu' : 'g');
    const specialCharCount = (value.match(specialCharPattern) || []).length;
    const totalLength = value.length;
    
    // If more than 30% special characters, consider suspicious
    return specialCharCount / totalLength > 0.3;
  }

  /**
   * Validate array depth
   */
  private static validateArrayDepth(arr: any, currentDepth: number): boolean {
    if (currentDepth >= this.MAX_OBJECT_DEPTH) {
      return false;
    }
    
    for (const item of arr) {
      if (Array.isArray(item)) {
        if (!this.validateArrayDepth(item, currentDepth + 1)) {
          return false;
        }
      } else if (typeof item === 'object' && item !== null) {
        if (!this.validateObjectDepth(item, currentDepth + 1)) {
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Validate object depth
   */
  private static validateObjectDepth(obj: any, currentDepth: number): boolean {
    if (currentDepth >= this.MAX_OBJECT_DEPTH) {
      return false;
    }
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (Array.isArray(value)) {
          if (!this.validateArrayDepth(value, currentDepth + 1)) {
            return false;
          }
        } else if (typeof value === 'object' && value !== null) {
          if (!this.validateObjectDepth(value, currentDepth + 1)) {
            return false;
          }
        }
      }
    }
    
    return true;
  }

  /**
   * Validate pagination parameters
   */
  static createPaginationSchema() {
    return z.object({
      offset: this.createSecureNumber(0, 1000000).optional().default(0),
      size: this.createSecureNumber(1, 1000).optional().default(100)
    });
  }

  /**
   * Validate task ID parameters
   */
  static createTaskIdSchema() {
    return z.string()
      .min(1, 'Task ID cannot be empty')
      .max(100, 'Task ID too long')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Task ID contains invalid characters')
      .refine(
        (value) => this.validateStringContent(value),
        'Task ID contains potentially malicious content'
      );
  }

  /**
   * Validate search query parameters
   */
  static createSearchQuerySchema() {
    return z.string()
      .min(1, 'Search query cannot be empty')
      .max(500, 'Search query too long')
      .refine(
        (value) => !(/^[\s\*\?%]+$/.test(value)),
        'Search query cannot contain only wildcards'
      )
      .refine(
        (value) => this.validateSearchQueryContent(value),
        'Search query contains potentially malicious content'
      );
  }

  /**
   * Validate email format
   */
  static createEmailSchema() {
    return z.string()
      .max(254, 'Email too long')
      .email('Invalid email format')
      .refine(
        (value) => !this.containsMaliciousEmailPatterns(value),
        'Email contains suspicious patterns'
      );
  }

  /**
   * Check for malicious email patterns
   */
  private static containsMaliciousEmailPatterns(email: string): boolean {
    // Multiple @ symbols
    if ((email.match(/@/g) || []).length !== 1) {
      return true;
    }
    
    // Suspicious TLDs or patterns
    const suspiciousPatterns = [
      /\.tk$/i,  // Suspicious TLD
      /\.ml$/i,  // Suspicious TLD
      /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/, // IP address
      /localhost/i,
      /127\.0\.0\.1/,
      /\.(exe|bat|cmd|scr|vbs|js)$/i // Executable extensions
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(email));
  }

  /**
   * Create comprehensive request validation schema
   */
  static createRequestValidationSchema() {
    return z.object({
      // Request size limits
      headers: z.record(this.createSecureString(1000)).optional(),
      query: z.record(this.createSecureString(1000)).optional(),
      body: z.any().refine(
        (value) => {
          if (typeof value === 'string') {
            return value.length <= 1000000; // 1MB limit
          }
          return JSON.stringify(value).length <= 1000000;
        },
        'Request body exceeds size limit'
      ).optional()
    });
  }
}

/**
 * Input validation middleware for Express
 */
export class ValidationMiddleware {
  /**
   * Create validation middleware for route parameters
   */
  static validateParams(schema: z.ZodSchema) {
    return (req: any, res: any, next: any) => {
      try {
        const validatedParams = schema.parse(req.params);
        req.params = validatedParams;
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          });
        } else {
          res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'Validation processing error'
          });
        }
      }
    };
  }

  /**
   * Create validation middleware for request body
   */
  static validateBody(schema: z.ZodSchema) {
    return (req: any, res: any, next: any) => {
      try {
        const validatedBody = schema.parse(req.body);
        req.body = validatedBody;
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          });
        } else {
          res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'Validation processing error'
          });
        }
      }
    };
  }

  /**
   * Create validation middleware for query parameters
   */
  static validateQuery(schema: z.ZodSchema) {
    return (req: any, res: any, next: any) => {
      try {
        const validatedQuery = schema.parse(req.query);
        req.query = validatedQuery;
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          });
        } else {
          res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'Validation processing error'
          });
        }
      }
    };
  }
}
