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
