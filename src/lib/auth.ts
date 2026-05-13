/**
 * API Authentication & Rate Limiting
 * 
 * Simple in-memory rate limiter + API key validation.
 * For production, use Redis-backed rate limiting.
 */

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60 * 1000, // 30 requests per minute
};

const API_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 100 requests per minute for API key holders
};

/**
 * Check rate limit for a given identifier (IP or API key).
 * Returns { allowed, remaining, resetAt }.
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || now > entry.resetAt) {
    // New window
    rateLimitStore.set(identifier, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Validate API key from request headers.
 * Returns the key if valid, null if not provided (allow anonymous with lower rate limit).
 */
export function validateApiKey(req: Request): { valid: boolean; key?: string; isAnonymous: boolean } {
  // Check Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const key = authHeader.slice(7);
    // For now, any non-empty key is valid
    // In production, check against a database of valid keys
    if (key.length > 0) {
      return { valid: true, key, isAnonymous: false };
    }
  }

  // Check X-API-Key header
  const apiKey = req.headers.get('x-api-key');
  if (apiKey && apiKey.length > 0) {
    return { valid: true, key: apiKey, isAnonymous: false };
  }

  // Anonymous request
  return { valid: false, isAnonymous: true };
}

/**
 * Get client IP from request headers.
 */
export function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
}

/**
 * Middleware-style function to check auth + rate limit.
 * Returns null if OK, or a Response to return immediately.
 */
export function checkAuthAndRateLimit(req: Request): Response | null {
  const { key, isAnonymous } = validateApiKey(req);
  const identifier = isAnonymous ? getClientIp(req) : `key:${key}`;
  const config = isAnonymous ? DEFAULT_RATE_LIMIT : API_RATE_LIMIT;

  const { allowed, remaining, resetAt } = checkRateLimit(identifier, config);

  if (!allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
          'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  // Return null = OK, proceed
  return null;
}

/**
 * Add rate limit headers to a response.
 */
export function addRateLimitHeaders(
  headers: Headers,
  identifier: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): void {
  const entry = rateLimitStore.get(identifier);
  if (entry) {
    headers.set('X-RateLimit-Limit', String(config.maxRequests));
    headers.set('X-RateLimit-Remaining', String(Math.max(0, config.maxRequests - entry.count)));
    headers.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
  }
}

// Cleanup old entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 60000); // Cleanup every minute
}
