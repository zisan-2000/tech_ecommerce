type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitBucket>;

const globalRateLimit = globalThis as typeof globalThis & {
  __phase0RateLimitStore?: RateLimitStore;
};

const store =
  globalRateLimit.__phase0RateLimitStore ??
  (globalRateLimit.__phase0RateLimitStore = new Map());

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    forwarded ||
    "unknown"
  ).slice(0, 128);
}

export function rateLimitRequest(
  request: Request,
  options: { scope: string; limit: number; windowMs: number },
) {
  const now = Date.now();
  const key = `${options.scope}:${getClientIp(request)}`;
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.limit - 1, retryAfter: 0 };
  }

  if (current.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, options.limit - current.count),
    retryAfter: 0,
  };
}

