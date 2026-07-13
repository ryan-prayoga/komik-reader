// Shared "what to show in Lanjut Baca" resolver — home page rail and sidebar
// rail both dedup local history per manga to its most recently touched
// chapter. Previously each call site skipped a manga entirely once its latest
// row was marked read (`if (h.isRead) continue`), so the card vanished the
// instant a chapter was finished and stayed gone until the user opened the
// next chapter (which only happens after they already found it some other
// way). Keep the manga's card either way — the caller renders the "read"
// case as a link to the manga's detail page instead of the finished chapter,
// since the detail page already resolves the true next-unread chapter.

import type { LocalHistory } from './local/types';
import type { RecentChapter } from './graphql/types';

export function buildContinueReading(history: LocalHistory[], limit: number): RecentChapter[] {
	const seen = new Set<number>();
	const out: RecentChapter[] = [];
	// history arrives sorted updatedAt desc, so the first row per manga is
	// always the last-touched one.
	for (const h of history) {
		if (seen.has(h.mangaId)) continue;
		seen.add(h.mangaId);
		out.push({
			id: h.chapterId,
			name: h.chapterName,
			mangaId: h.mangaId,
			lastPageRead: h.lastPage,
			totalPages: h.totalPages,
			isRead: h.isRead,
			lastReadAt: '',
			manga: { id: h.mangaId, title: h.mangaTitle, thumbnailUrl: h.thumbnailUrl }
		});
		if (out.length >= limit) break;
	}
	return out;
}

/** null when there's nothing meaningful to show (finished, unstarted, or unknown page count). */
export function continueProgressPct(ch: RecentChapter): number | null {
	if (ch.isRead) return null;
	if (!ch.totalPages || ch.totalPages <= 1) return null;
	if (ch.lastPageRead <= 0) return null;
	if (ch.lastPageRead >= ch.totalPages - 1) return null;
	return Math.round(((ch.lastPageRead + 1) / ch.totalPages) * 100);
}

// ── Manga-level continue status (badge on Lanjut Baca cards) ─────────────────
// Labels reflect *all chapters* of the series, not just the last-touched one:
//   Lanjut  — still has unread chapters (mid-chapter or next chapter exists)
//   Baru    — new chapter available beyond what the user last acknowledged
//   Selesai — finished every known chapter; series still ongoing/hiatus/unknown
//   Tamat   — finished every known chapter; series is completed

export type ContinueStatusKind = 'lanjut' | 'baru' | 'selesai' | 'tamat';

/** Lanjut Baca is for active reading — "sudah baca semua" belongs to koleksi. */
export const CONTINUE_READING_STALE_FINISHED_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A finished (selesai/tamat) card older than the stale window drops out of
 * Lanjut Baca — it stays reachable via /history, but no longer clutters the
 * "what to continue" list once there's nothing left to continue.
 */
export function isFinishedStale(
	kind: ContinueStatusKind,
	lastActivityAt: number,
	now: number
): boolean {
	if (kind !== 'selesai' && kind !== 'tamat') return false;
	return now - lastActivityAt > CONTINUE_READING_STALE_FINISHED_MS;
}

export type ContinueStatus = {
	kind: ContinueStatusKind;
	/** Short badge text (LANJUT / BARU / SELESAI / TAMAT). */
	label: string;
	/** Card subtitle under the title. */
	subtitle: string;
	/** Tailwind badge background class. */
	badgeClass: string;
	showCheck: boolean;
	/**
	 * Preferred href: mid-chapter → that chapter; new chapter → latest id when
	 * known; otherwise manga detail (which resolves the true next unread).
	 */
	href: string;
};

export type ContinueUpdateMeta = {
	latestChapterId: number | null;
	latestChapterNumber: number;
	latestChapterName: string;
	mangaStatus?: string | null;
	/** True when latest is newer than last "seen" snapshot (library update badge). */
	hasUpdate?: boolean;
};

function isCompletedStatus(status: string | null | undefined): boolean {
	const s = (status ?? '').toUpperCase();
	return s === 'COMPLETED' || s === 'FINISHED' || s === 'PUBLISHING_FINISHED';
}

/** Short series-status word for subtitles (null when unknown). */
function seriesStatusLabel(status: string | null | undefined): string | null {
	const s = (status ?? '').toUpperCase();
	if (s === 'ONGOING') return 'Ongoing';
	if (s === 'HIATUS') return 'Hiatus';
	if (s === 'ABANDONED' || s === 'CANCELLED' || s === 'CANCELED') return 'Dropped';
	if (isCompletedStatus(s)) return 'Tamat';
	return null;
}

/** Whether the user has fully read the newest known chapter for this manga. */
export function isLatestChapterRead(
	historyForManga: Array<{ chapterId: number; chapterNumber?: number; isRead: boolean }>,
	meta: Pick<ContinueUpdateMeta, 'latestChapterId' | 'latestChapterNumber'>
): boolean {
	if (meta.latestChapterId != null) {
		const byId = historyForManga.find((h) => h.chapterId === meta.latestChapterId);
		if (byId) return byId.isRead;
	}
	// Fallback: highest fully-read chapterNumber covers the latest number.
	// (Missing chapterNumber on older history rows → treat as not caught up.)
	if (!(meta.latestChapterNumber > 0)) return false;
	let maxRead = 0;
	let anyNumbered = false;
	for (const h of historyForManga) {
		if (!h.isRead || h.chapterNumber == null) continue;
		anyNumbered = true;
		if (h.chapterNumber > maxRead) maxRead = h.chapterNumber;
	}
	return anyNumbered && maxRead >= meta.latestChapterNumber;
}

/**
 * Resolve badge/subtitle/href for a Lanjut Baca card from last-touched history,
 * full history for that manga, and optional update snapshot (latest chapter +
 * publication status).
 */
export function resolveContinueStatus(input: {
	lastChapter: {
		id: number;
		name: string;
		mangaId: number;
		isRead?: boolean;
		chapterNumber?: number;
	};
	historyForManga: Array<{ chapterId: number; chapterNumber?: number; isRead: boolean }>;
	updateMeta?: ContinueUpdateMeta | null;
}): ContinueStatus {
	const { lastChapter: last, historyForManga, updateMeta: meta } = input;
	const mangaHref = `/manga/${last.mangaId}`;
	const midHref = `/read/${last.id}`;

	// Still inside a chapter → continue right there.
	if (!last.isRead) {
		return {
			kind: 'lanjut',
			label: 'Lanjut',
			subtitle: last.name,
			badgeClass: 'bg-accent',
			showCheck: false,
			href: midHref
		};
	}

	// Last-touched chapter is finished. Prefer manga-level knowledge when we
	// have a latest-chapter snapshot from detail/update checks.
	if (meta && (meta.latestChapterId != null || meta.latestChapterNumber > 0)) {
		const latestRead = isLatestChapterRead(historyForManga, meta);

		if (!latestRead) {
			// Unread content beyond current position.
			const latestHref =
				meta.latestChapterId != null ? `/read/${meta.latestChapterId}` : mangaHref;

			// Library "update" flag (or last chapter clearly behind latest) → Baru.
			const lastNum = last.chapterNumber ?? 0;
			const behindLatest =
				meta.latestChapterNumber > 0 && lastNum > 0 && lastNum < meta.latestChapterNumber;
			const idBehind =
				meta.latestChapterId != null && meta.latestChapterId !== last.id && last.isRead;

			if (meta.hasUpdate || behindLatest || idBehind) {
				return {
					kind: 'baru',
					label: 'Baru',
					subtitle: meta.latestChapterName
						? `Baru · ${meta.latestChapterName}`
						: 'Chapter baru tersedia',
					badgeClass: 'bg-accent',
					showCheck: false,
					href: latestHref
				};
			}

			// Finished current, more chapters exist but not flagged as "new".
			return {
				kind: 'lanjut',
				label: 'Lanjut',
				subtitle: 'Lanjut ke chapter berikutnya',
				badgeClass: 'bg-accent',
				showCheck: false,
				href: mangaHref
			};
		}

		// Every known chapter is read — badge reflects publication state so the
		// user sees "sudah baca semua" vs "komik sudah tamat" at a glance.
		if (isCompletedStatus(meta.mangaStatus)) {
			return {
				kind: 'tamat',
				label: 'Tamat',
				subtitle: 'Tamat · semua chapter dibaca',
				badgeClass: 'bg-success',
				showCheck: true,
				href: mangaHref
			};
		}

		// ONGOING / HIATUS / UNKNOWN / missing status → done reading for now.
		const seriesHint = seriesStatusLabel(meta.mangaStatus);
		return {
			kind: 'selesai',
			label: 'Selesai',
			subtitle: seriesHint
				? `${seriesHint} · menunggu chapter baru`
				: 'Menunggu chapter baru',
			badgeClass: 'bg-warning',
			showCheck: false,
			href: mangaHref
		};
	}

	// No update meta: never claim SELESAI — we can't prove every chapter is done.
	// Finished last-touched → point at detail (next unread / re-read).
	return {
		kind: 'lanjut',
		label: 'Lanjut',
		subtitle: 'Lanjut ke chapter berikutnya',
		badgeClass: 'bg-accent',
		showCheck: false,
		href: mangaHref
	};
}
