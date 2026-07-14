import { describe, expect, it } from 'vitest';
import {
	activePageFromPrefixHeights,
	buildAnchoredPrefixStarts,
	buildPrefixStarts
} from './active-page';

/** Equal-height pages: height 100 each → tops [0, 100, 200, …] */
function equalPrefix(count: number, height = 100, offset = 0): number[] {
	return buildPrefixStarts(Array.from({ length: count }, () => height), offset);
}

describe('buildPrefixStarts', () => {
	it('builds cumulative tops from heights with optional content offset', () => {
		expect(buildPrefixStarts([50, 100, 25])).toEqual([0, 50, 150]);
		expect(buildPrefixStarts([50, 100], 10)).toEqual([10, 60]);
	});

	it('treats non-positive / non-finite heights as 0 advance', () => {
		expect(buildPrefixStarts([100, 0, -5, Number.NaN, 50])).toEqual([0, 100, 100, 100, 100]);
	});
});

describe('activePageFromPrefixHeights', () => {
	// viewport 500, activation 0.4 → line at scrollTop + 200
	const H = 500;
	const FRAC = 0.4;

	it('returns null for empty prefix', () => {
		expect(activePageFromPrefixHeights([], 0, H, FRAC)).toBeNull();
	});

	it('returns null when no page top has crossed the activation line', () => {
		// first page top at 300, targetY at scroll 0 = 200
		const prefix = buildPrefixStarts([100, 100], 300);
		expect(activePageFromPrefixHeights(prefix, 0, H, FRAC)).toBeNull();
	});

	it('picks deepest page whose top is at/above the activation line', () => {
		const prefix = equalPrefix(10);
		expect(activePageFromPrefixHeights(prefix, 0, H, FRAC)).toBe(2);
	});

	it('returns 0 when only the first page top has crossed (tall pages)', () => {
		const prefix = equalPrefix(5, 400);
		expect(activePageFromPrefixHeights(prefix, 0, H, FRAC)).toBe(0);
	});

	it('binary-searches mid-chapter to the deepest page past the line', () => {
		const prefix = equalPrefix(20);
		expect(activePageFromPrefixHeights(prefix, 450, H, FRAC)).toBe(6);
	});

	it('advances as scrollTop increases (monotonic)', () => {
		const prefix = equalPrefix(15);
		const a = activePageFromPrefixHeights(prefix, 0, H, FRAC);
		const b = activePageFromPrefixHeights(prefix, 300, H, FRAC);
		const c = activePageFromPrefixHeights(prefix, 900, H, FRAC);
		expect(a).toBe(2);
		expect(b).toBe(5);
		expect(c).toBe(11);
		expect(a!).toBeLessThan(b!);
		expect(b!).toBeLessThan(c!);
	});

	it('uses custom activationFrac', () => {
		const prefix = equalPrefix(10);
		// frac 0 → targetY = scrollTop; at 250 → page 2 top 200, page 3 top 300 → 2
		expect(activePageFromPrefixHeights(prefix, 250, H, 0)).toBe(2);
		// frac 1 → targetY = scrollTop + clientHeight = 750 → page 7 top 700, page 8 top 800 → 7
		expect(activePageFromPrefixHeights(prefix, 250, H, 1)).toBe(7);
	});

	it('forces last index when lastBottom is fully inside the viewport', () => {
		const prefix = equalPrefix(5, 100);
		// last page ends at 500. scrollTop 0, clientHeight 500 → fully visible
		expect(
			activePageFromPrefixHeights(prefix, 0, 500, FRAC, { lastBottom: 500 })
		).toBe(4);
	});

	it('does not force last when lastBottom is still below the fold', () => {
		const prefix = equalPrefix(5, 100);
		// lastBottom 900, view 0–500; falls through to binary search → i=2
		expect(
			activePageFromPrefixHeights(prefix, 0, 500, FRAC, { lastBottom: 900 })
		).toBe(2);
	});

	it('handles single-page chapter', () => {
		const prefix = [0];
		expect(activePageFromPrefixHeights(prefix, 0, H, FRAC)).toBe(0);
		expect(
			activePageFromPrefixHeights(prefix, 0, H, FRAC, { lastBottom: 80 })
		).toBe(0);
	});

	it('handles uneven heights', () => {
		// tops: 0, 40, 240, 290  (heights 40, 200, 50, 100)
		const prefix = buildPrefixStarts([40, 200, 50, 100]);
		// scrollTop 100 → targetY 300; page 2 top 240, page 3 top 290 → 3
		expect(activePageFromPrefixHeights(prefix, 100, H, FRAC)).toBe(3);
		// scrollTop 0 → targetY 200; page 1 top 40, page 2 top 240 → 1
		expect(activePageFromPrefixHeights(prefix, 0, H, FRAC)).toBe(1);
	});

	it('respects contentOffset in prefix (pages not starting at 0)', () => {
		// contentOffset 1000: tops 1000, 1100, 1200
		const prefix = equalPrefix(3, 100, 1000);
		// scroll 1000 → targetY 1200 → index 2
		expect(activePageFromPrefixHeights(prefix, 1000, H, FRAC)).toBe(2);
		// scroll 0 → targetY 200; first top 1000 > 200 → null
		expect(activePageFromPrefixHeights(prefix, 0, H, FRAC)).toBeNull();
	});

	it('empty prefix fallback does not throw (caller may pass [])', () => {
		expect(() => activePageFromPrefixHeights([], 10, 10)).not.toThrow();
		expect(activePageFromPrefixHeights([], 10, 10)).toBeNull();
	});
});

describe('buildAnchoredPrefixStarts', () => {
	it('reproduces offset prefix when anchored at 0', () => {
		const heights = [100, 100, 100];
		expect(buildAnchoredPrefixStarts(heights, 0, 50)).toEqual([50, 150, 250]);
	});

	it('propagates tops backward and forward from mid anchor', () => {
		const heights = [40, 200, 50, 100];
		// anchor index 2 top = 240 → [0, 40, 240, 290]
		expect(buildAnchoredPrefixStarts(heights, 2, 240)).toEqual([0, 40, 240, 290]);
	});

	it('clamps out-of-range anchor index', () => {
		// anchor→1 top 5 → starts[0]=5-heights[0]=-5
		expect(buildAnchoredPrefixStarts([10, 20], 99, 5)).toEqual([-5, 5]);
		expect(buildAnchoredPrefixStarts([10, 20], -3, 0)).toEqual([0, 10]);
	});
});
