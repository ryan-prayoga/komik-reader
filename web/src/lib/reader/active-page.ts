/**
 * Pure active-page resolution for webtoon scroll (O(log n) over height map).
 * Activation line = activationFrac down the viewport (default 0.4, matches
 * IntersectionObserver rootMargin 0 0 -60%). Active = deepest page top past
 * that line; lastBottom forces last index when the final page is fully in view.
 */

export type ActivePageOpts = {
	/** Content-space Y of the last page bottom; forces last index when fully visible. */
	lastBottom?: number;
};

/** Largest i with prefixHeights[i] <= targetY, or null if empty / none crossed. */
export function activePageFromPrefixHeights(
	prefixHeights: readonly number[],
	scrollTop: number,
	clientHeight: number,
	activationFrac = 0.4,
	opts?: ActivePageOpts
): number | null {
	const n = prefixHeights.length;
	if (n === 0) return null;

	const viewBottom = scrollTop + clientHeight;
	if (opts?.lastBottom != null && opts.lastBottom <= viewBottom + 1) {
		return n - 1;
	}

	const frac = Number.isFinite(activationFrac) ? activationFrac : 0.4;
	const targetY = scrollTop + frac * clientHeight;

	const first = prefixHeights[0];
	if (first == null || first > targetY) return null;

	let lo = 0;
	let hi = n - 1;
	let best = 0;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const top = prefixHeights[mid];
		if (top != null && top <= targetY) {
			best = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return best;
}

/** starts[i] = contentOffset + sum(heights[0..i-1]); non-positive heights advance 0. */
export function buildPrefixStarts(heights: readonly number[], contentOffset = 0): number[] {
	const starts: number[] = [];
	let y = contentOffset;
	for (const h of heights) {
		starts.push(y);
		const hh = Number.isFinite(h) && h > 0 ? h : 0;
		y += hh;
	}
	return starts;
}

/**
 * Build tops relative to a measured anchor page so CSS gaps/dividers near the
 * viewport do not accumulate from document start. heights[i] = page i height.
 */
export function buildAnchoredPrefixStarts(
	heights: readonly number[],
	anchorIndex: number,
	anchorContentTop: number
): number[] {
	const n = heights.length;
	if (n === 0) return [];
	const i0 = Math.max(0, Math.min(n - 1, anchorIndex));
	const starts = new Array<number>(n);
	starts[i0] = anchorContentTop;
	for (let i = i0 - 1; i >= 0; i--) {
		const h = heights[i];
		const hh = Number.isFinite(h) && h != null && h > 0 ? h : 0;
		starts[i] = starts[i + 1]! - hh;
	}
	for (let i = i0 + 1; i < n; i++) {
		const h = heights[i - 1];
		const hh = Number.isFinite(h) && h != null && h > 0 ? h : 0;
		starts[i] = starts[i - 1]! + hh;
	}
	return starts;
}
