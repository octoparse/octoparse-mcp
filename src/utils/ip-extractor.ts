import { Request } from 'express';

/**
 * Extract real client IP address from request
 * Supports various proxy headers and Express trust proxy
 *
 * Priority order:
 * 1. X-Forwarded-For (first IP in chain)
 * 2. X-Real-IP (Nginx)
 * 3. CF-Connecting-IP (Cloudflare)
 * 4. True-Client-IP (Akamai)
 * 5. X-Client-IP
 * 6. req.ip (Express with trust proxy)
 * 7. req.socket.remoteAddress (fallback)
 */
export function extractRealIP(req: Request): string | undefined {
  // 1. X-Forwarded-For - contains comma-separated list of IPs
  // Format: "client, proxy1, proxy2"
  const xForwardedFor = req.get('x-forwarded-for');
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    // Return the first IP (original client)
    const clientIP = ips[0];
    if (clientIP && isValidIP(clientIP)) {
      return clientIP;
    }
  }

  // 2. X-Real-IP - Nginx standard header
  const xRealIP = req.get('x-real-ip');
  if (xRealIP && isValidIP(xRealIP)) {
    return xRealIP;
  }

  // 3. CF-Connecting-IP - Cloudflare
  const cfConnectingIP = req.get('cf-connecting-ip');
  if (cfConnectingIP && isValidIP(cfConnectingIP)) {
    return cfConnectingIP;
  }

  // 4. True-Client-IP - Akamai and other CDNs
  const trueClientIP = req.get('true-client-ip');
  if (trueClientIP && isValidIP(trueClientIP)) {
    return trueClientIP;
  }

  // 5. X-Client-IP - Some proxies
  const xClientIP = req.get('x-client-ip');
  if (xClientIP && isValidIP(xClientIP)) {
    return xClientIP;
  }

  // 6. Express req.ip (works when trust proxy is enabled)
  if (req.ip) {
    return cleanIPv6(req.ip);
  }

  // 7. Fallback to socket remote address
  if (req.socket.remoteAddress) {
    return cleanIPv6(req.socket.remoteAddress);
  }

  return undefined;
}

/**
 * Validate if string is a valid IP address (IPv4 or IPv6)
 */
function isValidIP(ip: string): boolean {
  if (!ip || ip.trim().length === 0) {
    return false;
  }

  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(ip)) {
    const parts = ip.split('.').map(Number);
    return parts.every(part => part >= 0 && part <= 255);
  }

  // IPv6 pattern (simplified)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (ipv6Pattern.test(ip)) {
    return true;
  }

  return false;
}

/**
 * Clean IPv6-mapped IPv4 addresses
 * Converts "::ffff:192.168.1.1" to "192.168.1.1"
 */
function cleanIPv6(ip: string): string {
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  return ip;
}
