import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rateLimit, _reset } from './ratelimit';

describe('rateLimit', () => {
	beforeEach(() => _reset());
	afterEach(() => vi.useRealTimers());

	it('allows up to the limit then blocks', () => {
		const key = 'login:1.2.3.4';
		for (let i = 0; i < 3; i++) {
			expect(rateLimit(key, 3, 60_000).ok).toBe(true);
		}
		const blocked = rateLimit(key, 3, 60_000);
		expect(blocked.ok).toBe(false);
		expect(blocked.retryAfter).toBeGreaterThan(0);
	});

	it('isolates buckets per key', () => {
		expect(rateLimit('a', 1, 60_000).ok).toBe(true);
		expect(rateLimit('a', 1, 60_000).ok).toBe(false);
		// Different key (e.g. another IP) is unaffected.
		expect(rateLimit('b', 1, 60_000).ok).toBe(true);
	});

	it('resets after the window expires', () => {
		// Fake timers keep this deterministic (no reliance on wall-clock drift).
		vi.useFakeTimers();
		const key = 'reset:9.9.9.9';
		expect(rateLimit(key, 1, 1000).ok).toBe(true);
		expect(rateLimit(key, 1, 1000).ok).toBe(false); // still inside the window
		vi.advanceTimersByTime(1001); // window elapsed
		expect(rateLimit(key, 1, 1000).ok).toBe(true);
	});
});
