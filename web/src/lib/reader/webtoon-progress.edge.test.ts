import { describe, expect, it } from 'vitest';
import {
	WEBTOON_CHAPTER_DIVIDER_PX,
	WEBTOON_PAGE_GAP_PX,
	buildAnchoredPrefixWithGaps,
	chapterProgressFromRects,
	isWebtoonChapterRead,
	pageProgressFromRects,
	readingOrderGaps,
	shouldEmitWebtoonProgress
} from './webtoon-progress';

/**
 * Extra edge-case QC beyond the main suite — targets residual risk classes
 * from the webtoon audit (monotonic isRead, emit guard, gap drift, clamps).
 */
describe('webtoon-progress edge QC', () => {
	describe('isWebtoonChapterRead monotonic surface', () => {
		it('single-page chapter is read at page 0', () => {
			expect(
				isWebtoonChapterRead({
					alreadyRead: false,
					pageIdx: 0,
					pageCount: 1,
					chapterProgress: 0
				})
			).toBe(true);
		});

		it('progress 1.0 mid index still latches read', () => {
			expect(
				isWebtoonChapterRead({
					alreadyRead: false,
					pageIdx: 2,
					pageCount: 20,
					chapterProgress: 1
				})
			).toBe(true);
		});

		it('progress just under threshold does not latch', () => {
			expect(
				isWebtoonChapterRead({
					alreadyRead: false,
					pageIdx: 18,
					pageCount: 20,
					chapterProgress: 0.9949
				})
			).toBe(false);
		});
	});

	describe('shouldEmitWebtoonProgress races', () => {
		it('rejects chapterId 0 even with element', () => {
			expect(shouldEmitWebtoonProgress(0, true)).toBe(false);
		});

		it('accepts only when both id and el are live', () => {
			expect(shouldEmitWebtoonProgress(99, true)).toBe(true);
			expect(shouldEmitWebtoonProgress(99, false)).toBe(false);
		});
	});

	describe('pageProgress clamps + NaN', () => {
		it('handles NaN inputs as 0', () => {
			expect(pageProgressFromRects(Number.NaN, 100, 0)).toBe(0);
			expect(pageProgressFromRects(0, 100, Number.NaN)).toBe(0);
		});

		it('scroller below page top still 0 (not negative)', () => {
			expect(pageProgressFromRects(200, 400, 100)).toBe(0);
		});
	});

	describe('chapterProgress short chapter + scroller inset', () => {
		it('short chapter with scroller inset still ends at 1 when first at scroller', () => {
			// scroller top 80, first top 80, last bottom 300, height 800
			expect(chapterProgressFromRects(80, 300, 80, 800)).toBe(1);
		});

		it('short chapter not yet at top stays 0', () => {
			expect(chapterProgressFromRects(200, 400, 80, 800)).toBe(0);
		});

		it('mid progress with scroller inset uses relative firstTop', () => {
			// firstTop=-520, lastBottom=1080, scrollerTop=80, h=800
			// scrollable = 1080 - (-520) - 800 = 800
			// progress = (80 - (-520)) / 800 = 0.75
			expect(chapterProgressFromRects(-520, 1080, 80, 800)).toBeCloseTo(0.75);
			// Same geometry with scrollerTop=0 would be 520/800 = 0.65 — inset matters.
			expect(chapterProgressFromRects(-520, 1080, 0, 800)).toBeCloseTo(0.65);
		});
	});

	describe('readingOrderGaps multi-chapter chain', () => {
		it('two boundaries get two dividers', () => {
			const gaps = readingOrderGaps(
				[{ chapterId: 1 }, { chapterId: 2 }, { chapterId: 3 }],
				WEBTOON_PAGE_GAP_PX
			);
			expect(gaps).toEqual([
				WEBTOON_PAGE_GAP_PX + WEBTOON_CHAPTER_DIVIDER_PX,
				WEBTOON_PAGE_GAP_PX + WEBTOON_CHAPTER_DIVIDER_PX
			]);
		});

		it('empty / single entry yields no gaps', () => {
			expect(readingOrderGaps([], 4)).toEqual([]);
			expect(readingOrderGaps([{ chapterId: 1 }], 4)).toEqual([]);
		});

		it('prefix with gaps keeps mid-chapter spacing smaller than cross-chapter', () => {
			const entries = [
				{ chapterId: 1 },
				{ chapterId: 1 },
				{ chapterId: 2 },
				{ chapterId: 2 }
			];
			const gaps = readingOrderGaps(entries, 4);
			const tops = buildAnchoredPrefixWithGaps([100, 100, 100, 100], 0, 0, gaps);
			const sameChapterStep = tops[1]! - tops[0]!;
			const crossChapterStep = tops[2]! - tops[1]!;
			expect(sameChapterStep).toBe(104);
			expect(crossChapterStep).toBe(100 + 4 + WEBTOON_CHAPTER_DIVIDER_PX);
			expect(crossChapterStep).toBeGreaterThan(sameChapterStep);
		});
	});
});
