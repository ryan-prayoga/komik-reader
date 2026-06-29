// In-memory fixed-window rate limiter. Single-node only (app runs as one
// container); state resets on restart, which is acceptable for abuse throttling.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
	// Prune expired buckets at most once per minute to bound memory.
	if (now - lastSweep < 60_000) return;
	lastSweep = now;
	for (const [key, b] of buckets) {
		if (b.resetAt <= now) buckets.delete(key);
	}
}

export type RateLimitResult = { ok: boolean; retryAfter: number };

/**
 * @param key       unique bucket key (e.g. `login:1.2.3.4`)
 * @param limit     max allowed hits per window
 * @param windowMs  window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
	const now = Date.now();
	sweep(now);

	const b = buckets.get(key);
	if (!b || b.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return { ok: true, retryAfter: 0 };
	}

	if (b.count >= limit) {
		return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
	}

	b.count += 1;
	return { ok: true, retryAfter: 0 };
}

// Exposed for tests only.
export function _reset() {
	buckets.clear();
	lastSweep = 0;
}
