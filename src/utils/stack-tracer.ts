/**
 * Extract caller information from stack trace
 * Used to identify which file/function is logging
 */

export interface CallerInfo {
  /** File path relative to project root */
  file: string;
  /** Line number in the file */
  line?: number;
  /** Function name (if available) */
  function?: string;
}

/**
 * Get information about the caller of a function
 * @param depth - How many levels up the stack to look (default: 3)
 * @returns Caller information or undefined if not available
 */
export function getCallerInfo(depth: number = 3): CallerInfo | undefined {
  try {
    // Create error to capture stack trace
    const err = new Error();
    const stack = err.stack;

    if (!stack) {
      return undefined;
    }

    // Parse stack trace
    // Stack format:
    // Error
    //   at getCallerInfo (/path/to/stack-tracer.ts:XX:YY)
    //   at buildStructuredLog (/path/to/logger.ts:XX:YY)
    //   at Logger.info (/path/to/logger.ts:XX:YY)
    //   at requestLogger (/path/to/request-logger.ts:XX:YY) <- We want this
    const lines = stack.split('\n');

    // Get the line at specified depth
    if (lines.length <= depth) {
      return undefined;
    }

    const targetLine = lines[depth];

    // Parse the stack line
    // Format: "    at functionName (/path/to/file.ts:line:col)"
    // or: "    at /path/to/file.ts:line:col"
    const match = targetLine.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);

    if (!match) {
      return undefined;
    }

    const functionName = match[1]?.trim();
    const filePath = match[2];
    const lineNumber = parseInt(match[3], 10);

    // Extract relative path from absolute path
    // Convert: "\src\middleware\request-logger.ts"
    // To: "src/middleware/request-logger.ts"
    const relativePath = extractRelativePath(filePath);

    return {
      file: relativePath,
      line: lineNumber,
      function: functionName
    };
  } catch (error) {
    // If anything goes wrong, return undefined
    return undefined;
  }
}

/**
 * Extract relative path from absolute path
 */
function extractRelativePath(absolutePath: string): string {
  // Remove Windows/Unix path prefixes
  let path = absolutePath;

  // Find common project markers
  const markers = ['src/', 'dist/', 'OctopusMCPServer/'];

  for (const marker of markers) {
    const index = path.lastIndexOf(marker);
    if (index !== -1) {
      path = path.substring(index);
      break;
    }
  }

  // Convert backslashes to forward slashes for consistency
  path = path.replace(/\\/g, '/');

  // Remove file:// prefix if present
  path = path.replace(/^file:\/\/\//, '');

  return path;
}

/**
 * Format caller info as a short string
 * Example: "src/middleware/request-logger.ts:42"
 */
export function formatCallerInfo(info?: CallerInfo): string | undefined {
  if (!info) {
    return undefined;
  }

  let result = info.file;

  if (info.line) {
    result += `:${info.line}`;
  }

  return result;
}
