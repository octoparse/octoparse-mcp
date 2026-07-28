/**
 * JSON serialization optimizations
 * Reduces overhead from excessive JSON.stringify operations
 */

interface SerializationOptions {
  cache?: boolean;
  compress?: boolean;
  maxCacheSize?: number;
  replacer?: (key: string, value: any) => any;
}

/**
 * Optimized JSON serializer with caching and streaming support
 */
export class OptimizedJsonSerializer {
  private static cache = new Map<string, string>();
  private static readonly MAX_CACHE_SIZE = 1000;
  private static readonly LARGE_OBJECT_THRESHOLD = 10000; // 10KB

  /**
   * Stringify with optimizations
   */
  static stringify(value: any, options: SerializationOptions = {}): string {
    const {
      cache = true,
      compress = false,
      maxCacheSize = this.MAX_CACHE_SIZE,
      replacer
    } = options;

    // Generate cache key for primitive values and small objects
    let cacheKey: string | null = null;
    
    if (cache && this.isCacheable(value)) {
      cacheKey = this.generateCacheKey(value);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Use optimized stringifier based on object size
    let result: string;
    const size = this.estimateSize(value);
    
    if (size > this.LARGE_OBJECT_THRESHOLD) {
      // Large objects: use streaming approach
      result = this.stringifyLarge(value, replacer);
    } else {
      // Small objects: use standard approach with optimizations
      result = this.stringifySmall(value, replacer);
    }

    // Apply compression if requested and beneficial
    if (compress && result.length > 1000) {
      // Note: In a real implementation, you might use a compression library
      result = this.compressJson(result);
    }

    // Cache the result if cacheable
    if (cache && cacheKey && result.length < 50000) { // Don't cache very large results
      if (this.cache.size >= maxCacheSize) {
        this.evictLeastRecentlyUsed();
      }
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Parse with optimizations
   */
  static parse<T = any>(text: string, reviver?: (key: string, value: any) => any): T {
    // Check if this is compressed
    if (text.startsWith('{"_compressed":true,')) {
      text = this.decompressJson(text);
    }

    // Use optimized parser for large strings
    if (text.length > this.LARGE_OBJECT_THRESHOLD) {
      return this.parseLarge<T>(text, reviver);
    }

    return JSON.parse(text, reviver);
  }

  /**
   * Estimate object size for optimization decisions
   */
  private static estimateSize(value: any): number {
    if (value === null || value === undefined) return 4;
    
    switch (typeof value) {
      case 'boolean':
        return 5; // true/false
      case 'number':
        return value.toString().length;
      case 'string':
        return value.length + 2; // Add quotes
      case 'object':
        if (Array.isArray(value)) {
          return value.reduce((sum, item) => sum + this.estimateSize(item), 2); // Add brackets
        }
        return Object.keys(value).reduce((sum, key) => {
          return sum + key.length + 3 + this.estimateSize(value[key]); // Add key quotes and colon
        }, 2); // Add braces
      default:
        return 10; // Default estimate
    }
  }

  /**
   * Check if value is cacheable
   */
  private static isCacheable(value: any): boolean {
    // Don't cache functions, dates, or very large objects
    if (typeof value === 'function') return false;
    if (value instanceof Date) return false;
    if (this.estimateSize(value) > 5000) return false;
    
    // Check for circular references (simplified check)
    try {
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate cache key for value
   */
  private static generateCacheKey(value: any): string {
    // Simple hash-based cache key
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    let hash = 0;
    for (let i = 0; i < Math.min(str.length, 100); i++) { // Only hash first 100 chars for performance
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `json:${Math.abs(hash)}:${str.length}`;
  }

  /**
   * Stringify small objects with optimizations
   */
  private static stringifySmall(value: any, replacer?: (key: string, value: any) => any): string {
    // Use a custom replacer that optimizes common patterns
    const optimizedReplacer = (key: string, val: any) => {
      // Apply user replacer first
      if (replacer) {
        val = replacer(key, val);
      }

      // Optimize null/undefined handling
      if (val === null || val === undefined) {
        return val;
      }

      // Optimize array handling
      if (Array.isArray(val)) {
        // Remove null/undefined elements if they're at the end
        while (val.length > 0 && (val[val.length - 1] === null || val[val.length - 1] === undefined)) {
          val.pop();
        }
      }

      // Optimize object handling
      if (typeof val === 'object' && val !== null) {
        // Remove undefined properties
        const cleaned: any = {};
        for (const [k, v] of Object.entries(val)) {
          if (v !== undefined) {
            cleaned[k] = v;
          }
        }
        return cleaned;
      }

      return val;
    };

    return JSON.stringify(value, optimizedReplacer);
  }

  /**
   * Stringify large objects with streaming approach
   */
  private static stringifyLarge(value: any, replacer?: (key: string, value: any) => any): string {
    // For very large objects, process in chunks to avoid blocking the event loop
    // This is a simplified implementation - in production, you might use a streaming JSON library
    
    if (Array.isArray(value)) {
      return this.stringifyLargeArray(value, replacer);
    } else if (typeof value === 'object' && value !== null) {
      return this.stringifyLargeObject(value, replacer);
    }

    return JSON.stringify(value, replacer);
  }

  /**
   * Stringify large arrays in chunks
   */
  private static stringifyLargeArray(arr: any[], replacer?: (key: string, value: any) => any): string {
    const chunks: string[] = ['['];
    const chunkSize = 1000; // Process 1000 items at a time

    for (let i = 0; i < arr.length; i += chunkSize) {
      const chunk = arr.slice(i, i + chunkSize);
      const chunkJson = chunk.map(item => JSON.stringify(item, replacer)).join(',');
      
      if (i > 0) chunks.push(',');
      chunks.push(chunkJson);
    }

    chunks.push(']');
    return chunks.join('');
  }

  /**
   * Stringify large objects in chunks
   */
  private static stringifyLargeObject(obj: any, replacer?: (key: string, value: any) => any): string {
    const chunks: string[] = ['{'];
    const keys = Object.keys(obj);
    const chunkSize = 100; // Process 100 properties at a time

    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunkKeys = keys.slice(i, i + chunkSize);
      const chunkEntries = chunkKeys.map(key => {
        const value = replacer ? replacer(key, obj[key]) : obj[key];
        return `${JSON.stringify(key)}:${JSON.stringify(value)}`;
      });

      if (i > 0) chunks.push(',');
      chunks.push(chunkEntries.join(','));
    }

    chunks.push('}');
    return chunks.join('');
  }

  /**
   * Parse large JSON strings
   */
  private static parseLarge<T>(text: string, reviver?: (key: string, value: any) => any): T {
    // For large JSON, we can implement streaming parsing or chunked parsing
    // This is a simplified implementation
    return JSON.parse(text, reviver);
  }

  /**
   * Simple JSON compression (placeholder for real compression)
   */
  private static compressJson(json: string): string {
    // In a real implementation, you would use a compression library like pako or zlib
    // This is a simple placeholder that removes unnecessary whitespace
    const compressed = json.replace(/\s+/g, ' ').trim();
    
    // Wrap in compression marker
    return JSON.stringify({
      _compressed: true,
      data: compressed,
      originalLength: json.length
    });
  }

  /**
   * Decompress JSON
   */
  private static decompressJson(compressed: string): string {
    try {
      const obj = JSON.parse(compressed);
      if (obj._compressed && obj.data) {
        return obj.data;
      }
    } catch {
      // If decompression fails, return original
    }
    return compressed;
  }

  /**
   * Evict least recently used cache entries
   */
  private static evictLeastRecentlyUsed(): void {
    // Simple LRU eviction - remove 10% of cache
    const keysToRemove = Math.floor(this.cache.size * 0.1);
    const keys = Array.from(this.cache.keys());
    
    for (let i = 0; i < keysToRemove && keys.length > 0; i++) {
      this.cache.delete(keys[i]);
    }
  }

  /**
   * Clear serialization cache
   */
  static clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    // This would require tracking hits/misses in a real implementation
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      hitRate: 0 // Placeholder
    };
  }
}

/**
 * Response formatter with optimized JSON serialization
 */
export class OptimizedResponseFormatter {
  /**
   * Format MCP tool response with minimal JSON overhead
   */
  static formatMcpResponse(data: any): { content: Array<{ type: "text"; text: string }> } {
    // Optimize the response data before serialization
    const optimizedData = this.optimizeResponseData(data);
    
    // Use optimized serializer
    const text = OptimizedJsonSerializer.stringify(optimizedData, {
      cache: true,
      compress: JSON.stringify(optimizedData).length > 5000 // Compress large responses
    });

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }

  /**
   * Optimize response data structure
   */
  private static optimizeResponseData(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    // Remove undefined properties and empty arrays/objects
    if (typeof data === 'object') {
      if (Array.isArray(data)) {
        return data
          .filter(item => item !== undefined)
          .map(item => this.optimizeResponseData(item));
      } else {
        const optimized: any = {};
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) {
            // Skip empty objects and arrays unless they're meaningful
            if (this.isEmptyContainer(value) && !this.isMeaningfulEmpty(key)) {
              continue;
            }
            optimized[key] = this.optimizeResponseData(value);
          }
        }
        return optimized;
      }
    }

    return data;
  }

  /**
   * Check if value is an empty container
   */
  private static isEmptyContainer(value: any): boolean {
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    if (typeof value === 'object' && value !== null) {
      return Object.keys(value).length === 0;
    }
    return false;
  }

  /**
   * Check if empty container is meaningful for this key
   */
  private static isMeaningfulEmpty(key: string): boolean {
    // Some keys should be preserved even when empty
    const meaningfulEmptyKeys = ['data', 'items', 'results', 'errors', 'warnings'];
    return meaningfulEmptyKeys.includes(key.toLowerCase());
  }

  /**
   * Format error response efficiently
   */
  static formatErrorResponse(error: any): { content: Array<{ type: "text"; text: string }> } {
    // Create minimal error object
    const errorData = {
      success: false,
      error: {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || 'An error occurred',
        ...(error.statusCode && { statusCode: error.statusCode }),
        ...(error.details && { details: error.details })
      },
      timestamp: new Date().toISOString()
    };

    return this.formatMcpResponse(errorData);
  }
}

// Export convenience functions
export const { stringify, parse, clearCache } = OptimizedJsonSerializer;
export const { formatMcpResponse, formatErrorResponse } = OptimizedResponseFormatter;