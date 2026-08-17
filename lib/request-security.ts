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

let redis: Redis | null = null;

function getRedis() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Distributed rate limiting is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      );
    }
    return null;
  }

  redis ??= new Redis({ url, token });
  return redis;
}

export async function rateLimitRequest(
  request: Request,
  options: { scope: string; limit: number; windowMs: number },
) {
  const now = Date.now();
  const key = `${options.scope}:${getClientIp(request)}`;
  const redisClient = getRedis();

  if (redisClient) {
    const windowMs = Math.max(1_000, Math.ceil(options.windowMs));
    const windowId = Math.floor(now / windowMs);
    const redisKey = `rate-limit:${key}:${windowId}`;
    const count = Number(
      await redisClient.eval(
        "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return count;",
        [redisKey],
        [String(windowMs)],
      ),
    );
    const resetAt = (windowId + 1) * windowMs;
    const allowed = count <= options.limit;
    return {
      allowed,
      remaining: allowed ? Math.max(0, options.limit - count) : 0,
      retryAfter: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }

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
import { Redis } from "@upstash/redis";

