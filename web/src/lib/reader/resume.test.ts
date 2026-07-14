import { describe, expect, it } from 'vitest';
import {
	clampResumeToFreshPageCount,
	resumePageFor,
	resumeProgressFor,
	type ResumeHistoryRow
} from './resume';

function row(
	overrides: Partial<ResumeHistoryRow> & { chapterId: number }
): ResumeHistoryRow {
	return {
		lastPage: 0,
		isRead: false,
		...overrides
	};
}

describe('resumePageFor', () => {
	// (a) mid unfinished → lastPage
	it('(a) returns lastPage for mid-chapter unfinished history', () => {
		const history = [row({ chapterId: 10, lastPage: 7, totalPages: 20, isRead: false })];
		expect(resumePageFor(history, 10)).toBe(7);
	});

	// (b) isRead → 0
	it('(b) returns 0 when chapter is already read (re-read starts at beginning)', () => {
		const history = [row({ chapterId: 10, lastPage: 19, totalPages: 20, isRead: true })];
		expect(resumePageFor(history, 10)).toBe(0);
	});

	// (c) lastPage>=totalPages-1 & !isRead → 0
	it('(c) returns 0 when parked on last page even if isRead is still false', () => {
		const history = [row({ chapterId: 10, lastPage: 19, totalPages: 20, isRead: false })];
		expect(resumePageFor(history, 10)).toBe(0);
	});

	it('returns 0 when no history row exists for the chapter', () => {
		expect(resumePageFor([], 99)).toBe(0);
		expect(resumePageFor([row({ chapterId: 1, lastPage: 5 })], 99)).toBe(0);
	});

	it('returns lastPage when totalPages is missing (cannot detect last-page park)', () => {
		const history = [row({ chapterId: 10, lastPage: 12, isRead: false })];
		expect(resumePageFor(history, 10)).toBe(12);
	});
});

describe('resumeProgressFor', () => {
	// (d) fraction only if history.lastPage === page else 0
	it('(d) returns clamped fraction when history.lastPage matches page', () => {
		const history = [
			row({
				chapterId: 10,
				lastPage: 5,
				lastPageProgress: 0.42,
				isRead: false,
				totalPages: 20
			})
		];
		expect(resumeProgressFor(history, 10, 5)).toBe(0.42);
	});

	it('(d) returns 0 when history.lastPage does not match page (server-fallback)', () => {
		const history = [
			row({
				chapterId: 10,
				lastPage: 5,
				lastPageProgress: 0.8,
				isRead: false,
				totalPages: 20
			})
		];
		expect(resumeProgressFor(history, 10, 3)).toBe(0);
	});

	it('returns 0 when isRead is true', () => {
		const history = [
			row({
				chapterId: 10,
				lastPage: 5,
				lastPageProgress: 0.5,
				isRead: true,
				totalPages: 20
			})
		];
		expect(resumeProgressFor(history, 10, 5)).toBe(0);
	});

	it('clamps fraction to [0, 1]', () => {
		const high = [row({ chapterId: 1, lastPage: 2, lastPageProgress: 1.5 })];
		const low = [row({ chapterId: 1, lastPage: 2, lastPageProgress: -0.2 })];
		expect(resumeProgressFor(high, 1, 2)).toBe(1);
		expect(resumeProgressFor(low, 1, 2)).toBe(0);
	});

	it('returns 0 when lastPageProgress is undefined', () => {
		const history = [row({ chapterId: 1, lastPage: 2 })];
		expect(resumeProgressFor(history, 1, 2)).toBe(0);
	});
});

describe('clampResumeToFreshPageCount', () => {
	// (e) page < freshCount unchanged
	it('(e) leaves page unchanged when page is within freshCount', () => {
		const history = [row({ chapterId: 10, lastPage: 5, totalPages: 30 })];
		expect(clampResumeToFreshPageCount(history, 10, 5, 20)).toBe(5);
		expect(clampResumeToFreshPageCount(history, 10, 0, 20)).toBe(0);
		expect(clampResumeToFreshPageCount(history, 10, 19, 20)).toBe(19);
	});

	// (f) page >= freshCount rescale by stored totalPages
	it('(f) rescales page when page is past freshCount using stored totalPages', () => {
		// Stored: page 20 of 31 pages (~66% through). Fresh: 16 pages.
		// expected = round((20 / 30) * 15) = round(10) = 10, min(15, 10) = 10
		const history = [row({ chapterId: 10, lastPage: 20, totalPages: 31 })];
		expect(clampResumeToFreshPageCount(history, 10, 20, 16)).toBe(10);
	});

	it('(f) uses freshCount as total when stored totalPages is missing or <=1', () => {
		// page 10, freshCount 5, no stored total → total = 5
		// round((10 / 4) * 4) = 10, min(4, 10) = 4
		const noTotal = [row({ chapterId: 10, lastPage: 10 })];
		expect(clampResumeToFreshPageCount(noTotal, 10, 10, 5)).toBe(4);

		const oneTotal = [row({ chapterId: 10, lastPage: 10, totalPages: 1 })];
		expect(clampResumeToFreshPageCount(oneTotal, 10, 10, 5)).toBe(4);
	});

	it('returns 0 when freshCount is 0 or negative', () => {
		const history = [row({ chapterId: 10, lastPage: 5, totalPages: 20 })];
		expect(clampResumeToFreshPageCount(history, 10, 5, 0)).toBe(0);
		expect(clampResumeToFreshPageCount(history, 10, 5, -1)).toBe(0);
	});
});
