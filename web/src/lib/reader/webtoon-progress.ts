/**
 * Pure webtoon progress math (scroller-relative, not window-relative).
 * Used by WebtoonView and unit-tested so resume/isRead latch stay honest
 * when the real scroll surface is a fixed div (dock, safe-area, etc.).
 */

/** Tailwind `space-y-1` = 0.25rem ≈ 4px at default root font size. */
export const WEBTOON_PAGE_GAP_PX = 4 as const;

/**
 * Fraction (0–1) of a page scrolled past the scroller's top edge.
 * pageTop/scrollerTop are viewport-space (getBoundingClientRect).
 * progress 0 = page top at scroller top; 1 = page bottom at scroller top.
 */
export function pageProgressFromRects(
	pageTop: number,
	pageHeight: number,
	scrollerTop: number
): number {
	if (!(pageHeight > 0) || !Number.isFinite(pageHeight)) return 0;
	if (!Number.isFinite(pageTop) || !Number.isFinite(scrollerTop)) return 0;
	return Math.max(0, Math.min(1, (scrollerTop - pageTop) / pageHeight));
}

/**
 * True scroll-extent progress for a chapter: 0 at first page top in view,
 * 1 once scrolled to last page bottom flush with the scroller bottom.
 * All rects are viewport-space; clientHeight is the scroller's, not window.
 */
export function chapterProgressFromRects(
	firstTop: number,
	lastBottom: number,
	scrollerTop: number,
	clientHeight: number
): number {
	if (!Number.isFinite(firstTop) || !Number.isFinite(lastBottom)) return 0;
	if (!Number.isFinite(scrollerTop) || !Number.isFinite(clientHeight)) return 0;
	const viewH = clientHeight > 0 ? clientHeight : 0;
	if (viewH <= 0) return 0;
	const scrollable = lastBottom - firstTop - viewH;
	if (scrollable <= 0) return firstTop <= scrollerTop + 0.5 ? 1 : 0;
	return Math.max(0, Math.min(1, (scrollerTop - firstTop) / scrollable));
}

	/** Whether a webtoon chapter should be marked read (monotonic-friendly). */
	export function isWebtoonChapterRead(input: {
		readonly alreadyRead: boolean;
		readonly pageIdx: number;
		readonly pageCount: number;
		readonly chapterProgress: number;
		/** 0–1 fraction within the current page (optional; last page needs this or chapterProgress). */
		readonly pageProgress?: number;
	}): boolean {
		if (input.alreadyRead) return true;
		if (!(input.pageCount > 0)) return false;
		if (input.chapterProgress >= 0.995) return true;
		// Last page alone is not enough (tall panels) — need near end of page or chapter.
		if (input.pageIdx >= input.pageCount - 1) {
			const pp = input.pageProgress;
			if (typeof pp === 'number' && Number.isFinite(pp) && pp >= 0.9) return true;
			if (input.chapterProgress >= 0.9) return true;
			// Single-page chapter: require substantial scroll, not open alone.
			if (input.pageCount === 1) return input.chapterProgress >= 0.9;
			return false;
		}
		return false;
	}

/**
 * Drop empty / pre-anchor reports so a missing page node never overwrites
 * a real lastPageProgress with zeros mid-prune/remount.
 */
export function shouldEmitWebtoonProgress(
	activeChapterId: number,
	hasPageEl: boolean
): boolean {
	return activeChapterId !== 0 && hasPageEl;
}

/**
 * Approx height of the inter-chapter divider (flex + py-8 + pill label).
 * Only used in the height-map model when two consecutive reading-order
 * entries belong to different chapters — keeps active-page search honest
 * across section boundaries without measuring every divider node.
 */
export const WEBTOON_CHAPTER_DIVIDER_PX = 96 as const;

/**
 * Prefix tops with per-edge gaps (space-y between pages, divider between
 * chapters). Same contract as buildAnchoredPrefixStarts when all gaps are 0.
 * `gapAfter[i]` = space after page i before page i+1 (length n-1; missing → 0).
 */
export function buildAnchoredPrefixWithGaps(
	heights: readonly number[],
	anchorIndex: number,
	anchorContentTop: number,
	gapAfter: readonly number[] = []
): number[] {
	const n = heights.length;
	if (n === 0) return [];
	const i0 = Math.max(0, Math.min(n - 1, anchorIndex));
	const starts = new Array<number>(n);
	starts[i0] = anchorContentTop;
	for (let i = i0 - 1; i >= 0; i--) {
		const h = heights[i];
		const hh = Number.isFinite(h) && h != null && h > 0 ? h : 0;
		const g = gapAfter[i];
		const gap = Number.isFinite(g) && g != null && g > 0 ? g : 0;
		starts[i] = starts[i + 1]! - hh - gap;
	}
	for (let i = i0 + 1; i < n; i++) {
		const h = heights[i - 1];
		const hh = Number.isFinite(h) && h != null && h > 0 ? h : 0;
		const g = gapAfter[i - 1];
		const gap = Number.isFinite(g) && g != null && g > 0 ? g : 0;
		starts[i] = starts[i - 1]! + hh + gap;
	}
	return starts;
}

/** Uniform page gap helper (tests + simple call sites). */
export function buildAnchoredPrefixWithGap(
	heights: readonly number[],
	anchorIndex: number,
	anchorContentTop: number,
	gapPx = 0
): number[] {
	const n = heights.length;
	if (n <= 1) return buildAnchoredPrefixWithGaps(heights, anchorIndex, anchorContentTop, []);
	const gap = Number.isFinite(gapPx) && gapPx > 0 ? gapPx : 0;
	const gapAfter = Array.from({ length: n - 1 }, () => gap);
	return buildAnchoredPrefixWithGaps(heights, anchorIndex, anchorContentTop, gapAfter);
}

/**
 * Gap after each page in reading order: space-y between same-chapter pages,
 * plus chapter divider when the next page is a different chapter.
 */
export function readingOrderGaps(
	entries: readonly { readonly chapterId: number }[],
	pageGapPx: number
): number[] {
	const out: number[] = [];
	const pageGap = Number.isFinite(pageGapPx) && pageGapPx > 0 ? pageGapPx : 0;
	for (let i = 0; i < entries.length - 1; i++) {
		const cur = entries[i];
		const next = entries[i + 1];
		if (!cur || !next) {
			out.push(0);
			continue;
		}
		let g = pageGap;
		if (cur.chapterId !== next.chapterId) g += WEBTOON_CHAPTER_DIVIDER_PX;
		out.push(g);
	}
	return out;
}
