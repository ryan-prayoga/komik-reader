import { describe, it, expect } from 'vitest';
import { mergeReadPosition } from './history-merge';

describe('mergeReadPosition', () => {
	it('takes the incoming position when there is nothing stored', () => {
		expect(mergeReadPosition({ page: 4, progress: 0.5 }, null)).toEqual({
			page: 4,
			progress: 0.5
		});
	});

	it('advances page and fraction together', () => {
		expect(mergeReadPosition({ page: 12, progress: 0.2 }, { page: 5, progress: 0.9 })).toEqual({
			page: 12,
			progress: 0.2
		});
	});

	it('refines the fraction while on the same page', () => {
		expect(mergeReadPosition({ page: 7, progress: 0.75 }, { page: 7, progress: 0.1 })).toEqual({
			page: 7,
			progress: 0.75
		});
	});

	it('keeps the stored fraction when the same page reports none', () => {
		expect(mergeReadPosition({ page: 7 }, { page: 7, progress: 0.4 })).toEqual({
			page: 7,
			progress: 0.4
		});
	});

	it('does not attach an earlier page fraction to the furthest page', () => {
		// The regression: read to page 50 at 80%, scroll back to page 10 at 30%.
		// lastPage stays 50 (monotonic), so its fraction must stay 0.8 — pairing it
		// with 0.3 describes a position that never happened.
		expect(mergeReadPosition({ page: 10, progress: 0.3 }, { page: 50, progress: 0.8 })).toEqual({
			page: 50,
			progress: 0.8
		});
	});

	it('drops a stale fraction when advancing without one', () => {
		// Paged mode reports no fraction; carrying the previous page's 0.9 forward
		// would resume 90% into a page the reader has not opened.
		expect(mergeReadPosition({ page: 8 }, { page: 3, progress: 0.9 })).toEqual({ page: 8 });
	});

	it('is idempotent', () => {
		const once = mergeReadPosition({ page: 6, progress: 0.5 }, { page: 6, progress: 0.5 });
		expect(mergeReadPosition({ page: 6, progress: 0.5 }, once)).toEqual(once);
	});
});
