import { describe, it, expect } from 'vitest';
import { pairStart, nextIndex, lastVisibleIndex, type PagingMode } from './paging';

const single: PagingMode = { double: false, doubleOffset: false };
const double: PagingMode = { double: true, doubleOffset: false };
const offset: PagingMode = { double: true, doubleOffset: true };

/** Walk the reader forward the way next() does, collecting every left index. */
function walk(mode: PagingMode, pageCount: number): number[] {
	const lastIdx = pageCount - 1;
	const seen: number[] = [];
	let cur = 0;
	for (let guard = 0; guard < 100; guard++) {
		seen.push(cur);
		const n = nextIndex(cur, mode);
		if (n > lastIdx) break;
		cur = n;
	}
	return seen;
}

describe('pairStart', () => {
	it('is the identity in single mode', () => {
		for (const i of [0, 1, 2, 7]) expect(pairStart(i, single)).toBe(i);
	});

	it('pairs from 0 in plain double mode', () => {
		expect([0, 1, 2, 3, 4].map((i) => pairStart(i, double))).toEqual([0, 0, 2, 2, 4]);
	});

	it('leaves page 0 alone in offset mode, then pairs', () => {
		expect([0, 1, 2, 3, 4].map((i) => pairStart(i, offset))).toEqual([0, 1, 1, 3, 3]);
	});
});

describe('lastVisibleIndex', () => {
	it('equals the position itself in single mode', () => {
		expect(lastVisibleIndex(5, single, 9)).toBe(5);
	});

	it('is the right half of the spread in double mode', () => {
		expect(lastVisibleIndex(0, double, 9)).toBe(1);
		expect(lastVisibleIndex(8, double, 9)).toBe(9);
	});

	it('never runs past the final page on an unpaired tail', () => {
		// 9 pages (0–8): the last spread is {8} alone, not {8,9}.
		expect(lastVisibleIndex(8, double, 8)).toBe(8);
	});

	it('reports the lone first page in offset mode', () => {
		expect(lastVisibleIndex(0, offset, 9)).toBe(0);
		expect(lastVisibleIndex(1, offset, 9)).toBe(2);
	});
});

describe('reaching the end of a chapter', () => {
	// The regression: with an even page count the walk stops at pages.length - 2,
	// so a read check against pairStart alone never sees the final page.
	const cases: Array<{ mode: PagingMode; label: string; pageCount: number }> = [
		{ mode: single, label: 'single/even', pageCount: 10 },
		{ mode: single, label: 'single/odd', pageCount: 9 },
		{ mode: double, label: 'double/even', pageCount: 10 },
		{ mode: double, label: 'double/odd', pageCount: 9 },
		{ mode: offset, label: 'offset/even', pageCount: 10 },
		{ mode: offset, label: 'offset/odd', pageCount: 9 },
		{ mode: double, label: 'double/single-page', pageCount: 1 },
		{ mode: offset, label: 'offset/two-page', pageCount: 2 }
	];

	for (const { mode, label, pageCount } of cases) {
		it(`${label} (${pageCount}p): the last page is visible at the final position`, () => {
			const positions = walk(mode, pageCount);
			const final = positions[positions.length - 1];
			expect(lastVisibleIndex(final, mode, pageCount - 1)).toBe(pageCount - 1);
		});

		it(`${label} (${pageCount}p): every page is shown exactly once`, () => {
			const shown = new Set<number>();
			for (const p of walk(mode, pageCount)) {
				const start = pairStart(p, mode);
				const end = lastVisibleIndex(p, mode, pageCount - 1);
				for (let i = start; i <= end; i++) shown.add(i);
			}
			expect([...shown].sort((a, b) => a - b)).toEqual(
				Array.from({ length: pageCount }, (_, i) => i)
			);
		});
	}
});
