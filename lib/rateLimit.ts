type Bucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 20;
const buckets = new Map<string, Bucket>();

export function checkRateLimit(token: string): {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const current = buckets.get(token);

  if (!current || current.resetAt <= now) {
    const next: Bucket = {
      count: 1,
      resetAt: now + WINDOW_MS,
    };
    buckets.set(token, next);

    return {
      ok: true,
      limit: MAX_REQUESTS,
      remaining: MAX_REQUESTS - 1,
      resetAt: next.resetAt,
    };
  }

  if (current.count >= MAX_REQUESTS) {
    return {
      ok: false,
      limit: MAX_REQUESTS,
      remaining: 0,
      resetAt: current.resetAt,
    };
  }

  current.count += 1;

  return {
    ok: true,
    limit: MAX_REQUESTS,
    remaining: Math.max(0, MAX_REQUESTS - current.count),
    resetAt: current.resetAt,
  };
}
