/**
 * Pure resume helpers for the chapter reader.
 *
 * Semantics (locked):
 * - Re-reads of finished chapters start at page 0.
 * - A row parked on the last page with isRead still false is treated as finished.
 * - Webtoon within-page fraction only applies when history.lastPage === resume page.
 * - Page-count drift rescales by overall chapter fraction, not clamp-to-last.
 */

/** Minimal history shape needed by resume helpers (LocalHistory-compatible). */
export type ResumeHistoryRow = {
	chapterId: number;
	lastPage: number;
	isRead: boolean;
	totalPages?: number;
	lastPageProgress?: number;
};

function findRow(history: readonly ResumeHistoryRow[], id: number): ResumeHistoryRow | undefined {
	return history.find((x) => x.chapterId === id);
}

/**
 * Where to reopen a chapter: saved position while unfinished; page 0 once read
 * to the end (re-reads start at the beginning). A row parked on the chapter's
 * LAST page with isRead still false is a finished read whose read-mark never
 * landed — treat as finished so reopen is start, not end.
 */
export function resumePageFor(history: readonly ResumeHistoryRow[], id: number): number {
	const h = findRow(history, id);
	if (!h || h.isRead) return 0;
	if (h.totalPages && h.lastPage >= h.totalPages - 1) return 0;
	return h.lastPage;
}

/**
 * Fraction within the resume page (webtoon): only meaningful when the local
 * row is the one the page resume came from — a server-fallback resume has no
 * fraction, and a finished chapter reopens at the top.
 */
export function resumeProgressFor(
	history: readonly ResumeHistoryRow[],
	id: number,
	page: number
): number {
	const h = findRow(history, id);
	if (!h || h.isRead || h.lastPage !== page) return 0;
		const raw = h.lastPageProgress ?? 0;
		if (!Number.isFinite(raw)) return 0;
		return Math.max(0, Math.min(1, raw));
}

/**
 * A source re-scrape/re-upload can change a chapter's page count between
 * visits — the stored resume index can then point PAST the freshly fetched
 * chapter's last page. Rescale by the overall fraction through the chapter
 * instead of clamping to the very last page, so a 66%-through position still
 * resumes near 66% of the NEW page count rather than jumping to 100%.
 */
	export function clampResumeToFreshPageCount(
		history: readonly ResumeHistoryRow[],
		id: number,
		page: number,
		freshCount: number
	): number {
		if (freshCount <= 0) return 0;
		if (page < freshCount) return page;
		// Single-page chapter: only legal index is 0 (avoids /0 → NaN when total=1).
		if (freshCount === 1) return 0;
		const storedTotal = findRow(history, id)?.totalPages;
		const total = storedTotal && storedTotal > 1 ? storedTotal : freshCount;
		if (total <= 1) return 0;
		const scaled = Math.round((page / (total - 1)) * (freshCount - 1));
		if (!Number.isFinite(scaled)) return 0;
		return Math.min(freshCount - 1, Math.max(0, scaled));
	}
