/**
 * Merge rules for a history row's read position.
 *
 * `lastPage` is monotonic — scrolling back up must not lose how far someone got.
 * `lastPageProgress` is the scroll fraction WITHIN `lastPage`, which means the
 * two are only meaningful as a pair. Updating the fraction on its own produced
 * rows describing a position that never existed: read to page 50 at 80%, scroll
 * back to page 10 at 30%, and the row became page 50 at 30% — neither where the
 * reader stopped nor how far they had reached. Resume then landed in the wrong
 * part of the wrong page, and the continue-reading percentage was computed from
 * two different moments.
 */

export type ReadPosition = {
	page: number;
	/** Fraction within `page` (0–1, webtoon only). Undefined in paged mode. */
	progress?: number;
};

export function mergeReadPosition(
	incoming: ReadPosition,
	current: ReadPosition | null
): ReadPosition {
	if (!current) return incoming;

	// Moved further into the chapter: the incoming pair wins whole. A missing
	// fraction stays missing — the old one described a different page.
	if (incoming.page > current.page) return incoming;

	// Same page: the fraction is a refinement of the position we already hold.
	if (incoming.page === current.page) {
		return {
			page: current.page,
			progress: incoming.progress !== undefined ? incoming.progress : current.progress
		};
	}

	// Scrolled back. `lastPage` stays at the furthest point, so its fraction has
	// to stay with it — the incoming fraction belongs to an earlier page.
	return current;
}
