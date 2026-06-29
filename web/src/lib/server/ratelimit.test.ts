import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, _reset } from './ratelimit';

describe('rateLimit', () => {
	beforeEach(() => _reset());

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
		const key = 'reset:9.9.9.9';
		expect(rateLimit(key, 1, 1).ok).toBe(true);
		expect(rateLimit(key, 1, 1).ok).toBe(false);
		// Window of 1ms — busy-wait until it elapses, then it should allow again.
		const start = Date.now();
		while (Date.now() - start < 5) {
			/* spin */
		}
		expect(rateLimit(key, 1, 1).ok).toBe(true);
	});
});
