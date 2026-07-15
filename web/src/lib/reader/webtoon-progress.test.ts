import { describe, expect, it } from 'vitest';
import {
	WEBTOON_CHAPTER_DIVIDER_PX,
	WEBTOON_PAGE_GAP_PX,
	buildAnchoredPrefixWithGap,
	buildAnchoredPrefixWithGaps,
	chapterProgressFromRects,
	isWebtoonChapterRead,
	pageProgressFromRects,
	readingOrderGaps,
	shouldEmitWebtoonProgress
} from './webtoon-progress';

describe('pageProgressFromRects', () => {
	it('returns 0 when page top is at scroller top', () => {
		// Given page top 100, height 400, scroller top 100
		// When progress computed
		// Then 0
		expect(pageProgressFromRects(100, 400, 100)).toBe(0);
	});

	it('returns 0.5 halfway through the page relative to scroller', () => {
		// scroller top 300, page top 100, height 400 → (300-100)/400 = 0.5
		expect(pageProgressFromRects(100, 400, 300)).toBe(0.5);
	});

	it('returns 1 when page bottom is at scroller top', () => {
		expect(pageProgressFromRects(100, 400, 500)).toBe(1);
	});

	it('clamps below 0 and above 1', () => {
		expect(pageProgressFromRects(100, 400, 0)).toBe(0);
		expect(pageProgressFromRects(100, 400, 900)).toBe(1);
	});

	it('returns 0 for non-positive or non-finite height', () => {
		expect(pageProgressFromRects(0, 0, 0)).toBe(0);
		expect(pageProgressFromRects(0, -10, 0)).toBe(0);
		expect(pageProgressFromRects(0, Number.NaN, 0)).toBe(0);
	});

	it('does not use window origin — scroller inset is respected', () => {
		// scroller top at 80 (dock/safe-area), page top 80 → progress 0
		expect(pageProgressFromRects(80, 500, 80)).toBe(0);
		// old window-relative formula (-top/height) would be wrong here
		expect(pageProgressFromRects(80, 500, 80)).not.toBeCloseTo(-80 / 500);
	});
});

describe('chapterProgressFromRects', () => {
	it('returns 0 at chapter start (first top at scroller top)', () => {
		// firstTop=100, lastBottom=2100, scrollerTop=100, clientHeight=800
		// scrollable = 2100-100-800 = 1200; progress = 0
		expect(chapterProgressFromRects(100, 2100, 100, 800)).toBe(0);
	});

	it('returns 1 when last bottom is at scroller bottom', () => {
		// firstTop=-1200, lastBottom=800, scrollerTop=0, clientHeight=800
		// lastBottom at view bottom; scrollable = 800-(-1200)-800 = 1200
		// progress = (0 - (-1200)) / 1200 = 1
		expect(chapterProgressFromRects(-1200, 800, 0, 800)).toBe(1);
	});

	it('returns mid progress proportional to scroller travel', () => {
		// firstTop=-600, lastBottom=1400, scrollerTop=0, h=800
		// scrollable = 1400-(-600)-800 = 1200; progress = 600/1200 = 0.5
		expect(chapterProgressFromRects(-600, 1400, 0, 800)).toBeCloseTo(0.5);
	});

	it('returns 1 when content shorter than viewport and first top is at/above scroller', () => {
		expect(chapterProgressFromRects(0, 400, 0, 800)).toBe(1);
		expect(chapterProgressFromRects(50, 400, 0, 800)).toBe(0);
	});

	it('uses scroller clientHeight not window — dock layout still reaches 1', () => {
		// scroller only 600 tall (dock eats rest); full scroll to end
		const firstTop = -900;
		const lastBottom = 600;
		const scrollerTop = 0;
		const clientHeight = 600;
		// scrollable = 600 - (-900) - 600 = 900; progress = 900/900 = 1
		expect(chapterProgressFromRects(firstTop, lastBottom, scrollerTop, clientHeight)).toBe(1);
	});

	it('using larger window height over-reports mid progress (dock false isRead risk)', () => {
		// mid: firstTop=-450, lastBottom=1050, scroller 600 → progress 0.5
		// window 900 → scrollable shrinks → progress 0.75 (too high)
		expect(chapterProgressFromRects(-450, 1050, 0, 600)).toBeCloseTo(0.5);
		expect(chapterProgressFromRects(-450, 1050, 0, 900)).toBeCloseTo(0.75);
	});

	it('returns 0 for invalid clientHeight', () => {
		expect(chapterProgressFromRects(0, 1000, 0, 0)).toBe(0);
		expect(chapterProgressFromRects(0, 1000, 0, -1)).toBe(0);
	});
});

describe('isWebtoonChapterRead', () => {
	it('is true when alreadyRead regardless of position', () => {
		expect(
			isWebtoonChapterRead({ alreadyRead: true, pageIdx: 0, pageCount: 10, chapterProgress: 0 })
		).toBe(true);
	});

	it('is false on last page index until page/chapter near end', () => {
		expect(
			isWebtoonChapterRead({ alreadyRead: false, pageIdx: 9, pageCount: 10, chapterProgress: 0.2 })
		).toBe(false);
		expect(
			isWebtoonChapterRead({
				alreadyRead: false,
				pageIdx: 9,
				pageCount: 10,
				chapterProgress: 0.2,
				pageProgress: 0.95
			})
		).toBe(true);
		expect(
			isWebtoonChapterRead({ alreadyRead: false, pageIdx: 9, pageCount: 10, chapterProgress: 0.92 })
		).toBe(true);
	});

	it('is true when chapterProgress >= 0.995', () => {
		expect(
			isWebtoonChapterRead({ alreadyRead: false, pageIdx: 5, pageCount: 10, chapterProgress: 0.995 })
		).toBe(true);
		expect(
			isWebtoonChapterRead({ alreadyRead: false, pageIdx: 5, pageCount: 10, chapterProgress: 0.994 })
		).toBe(false);
	});

	it('is false mid-chapter with low progress', () => {
		expect(
			isWebtoonChapterRead({ alreadyRead: false, pageIdx: 3, pageCount: 10, chapterProgress: 0.4 })
		).toBe(false);
	});

	it('is false when pageCount is 0', () => {
		expect(
			isWebtoonChapterRead({ alreadyRead: false, pageIdx: 0, pageCount: 0, chapterProgress: 1 })
		).toBe(false);
	});
});

describe('shouldEmitWebtoonProgress', () => {
	it('rejects sentinel chapter id 0', () => {
		expect(shouldEmitWebtoonProgress(0, true)).toBe(false);
	});

	it('rejects missing page element', () => {
		expect(shouldEmitWebtoonProgress(42, false)).toBe(false);
	});

	it('accepts active chapter with live page node', () => {
		expect(shouldEmitWebtoonProgress(42, true)).toBe(true);
	});
});

describe('buildAnchoredPrefixWithGap', () => {
	it('matches no-gap tops when gap is 0', () => {
		expect(buildAnchoredPrefixWithGap([100, 100, 100], 0, 50, 0)).toEqual([50, 150, 250]);
	});

	it('inserts gap between consecutive pages', () => {
		// heights 100, gap 4 → tops 50, 154, 258
		expect(buildAnchoredPrefixWithGap([100, 100, 100], 0, 50, 4)).toEqual([50, 154, 258]);
	});

	it('propagates gap backward and forward from mid anchor', () => {
		// anchor index 1 top 200, heights 40/200/50, gap 4
		// starts[1]=200; starts[0]=200-40-4=156; starts[2]=200+200+4=404
		expect(buildAnchoredPrefixWithGap([40, 200, 50], 1, 200, 4)).toEqual([156, 200, 404]);
	});

	it('uses WEBTOON_PAGE_GAP_PX constant for space-y-1', () => {
		expect(WEBTOON_PAGE_GAP_PX).toBe(4);
		const tops = buildAnchoredPrefixWithGap([100, 100], 0, 0, WEBTOON_PAGE_GAP_PX);
		expect(tops[1]! - tops[0]!).toBe(100 + WEBTOON_PAGE_GAP_PX);
	});
});

describe('readingOrderGaps + chapter divider', () => {
	it('adds only page gap within the same chapter', () => {
		expect(readingOrderGaps([{ chapterId: 1 }, { chapterId: 1 }, { chapterId: 1 }], 4)).toEqual([
			4, 4
		]);
	});

	it('adds page gap + divider across chapter boundary', () => {
		expect(readingOrderGaps([{ chapterId: 1 }, { chapterId: 1 }, { chapterId: 2 }], 4)).toEqual([
			4,
			4 + WEBTOON_CHAPTER_DIVIDER_PX
		]);
	});

	it('buildAnchoredPrefixWithGaps places next chapter after divider', () => {
		const heights = [100, 100, 100];
		const gaps = readingOrderGaps([{ chapterId: 1 }, { chapterId: 1 }, { chapterId: 2 }], 4);
		// tops: 0, 104, 104+100+4+96 = 304
		expect(buildAnchoredPrefixWithGaps(heights, 0, 0, gaps)).toEqual([0, 104, 304]);
	});
});

