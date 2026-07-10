// Suwayomi deletes + re-creates a chapter row (new id, isRead reset to false,
// lastPageRead reset to 0) whenever a source re-uploads or renames a chapter's
// URL — `fetchChapters` runs on every manga-detail open, so this happens
// routinely. Local history rows are keyed by chapterId, so after a re-create
// they stop matching anything: the chapter silently shows "unread" again, the
// resume position is lost, and "Lanjutkan baca" falls back to the oldest
// unread chapter. This module re-keys those orphaned rows onto the live
// chapter with the same chapterNumber.
//
// Pure planner (no IndexedDB / runes) so it stays unit-testable in node.

import type { LocalHistory } from './types';

export type LiveChapter = { id: number; name: string; chapterNumber: number };

export type MigrationPlan = {
	/** Rows to persist: each migrated row + a tombstone for its old key. */
	writes: LocalHistory[];
	/** The re-keyed rows (new chapterId) — callers re-assert these on the server. */
	migrated: LocalHistory[];
	/** old chapterId → migrated row, for updating in-memory caches. */
	remap: Map<number, LocalHistory>;
};

export function planChapterIdMigration(
	mangaId: number,
	chapters: LiveChapter[],
	history: LocalHistory[],
	now: number
): MigrationPlan {
	const empty: MigrationPlan = { writes: [], migrated: [], remap: new Map() };
	if (!chapters.length) return empty;

	const liveIds = new Set(chapters.map((c) => c.id));
	// chapterNumber → live chapters carrying it. Only unambiguous (single-match)
	// numbers are migration targets; 0/negative numbers (oneshots, parse
	// failures) are never matchable.
	const byNumber = new Map<number, LiveChapter[]>();
	for (const c of chapters) {
		if (!(c.chapterNumber > 0)) continue;
		const list = byNumber.get(c.chapterNumber);
		if (list) list.push(c);
		else byNumber.set(c.chapterNumber, [c]);
	}

	// Ids already tracked by a history row for this manga — never migrate onto
	// one of those (the existing row is fresher truth for that chapter).
	const taken = new Set(
		history.filter((h) => h.mangaId === mangaId && !h.deleted).map((h) => h.chapterId)
	);

	const plan: MigrationPlan = { writes: [], migrated: [], remap: new Map() };
	// history arrives sorted by updatedAt desc, so when two orphans claim the
	// same live chapter the most recently touched one wins.
	for (const h of history) {
		if (h.deleted || h.mangaId !== mangaId || liveIds.has(h.chapterId)) continue;
		if (!h.chapterNumber || !(h.chapterNumber > 0)) continue;
		const candidates = byNumber.get(h.chapterNumber);
		if (!candidates || candidates.length !== 1) continue; // ambiguous → leave as-is
		const target = candidates[0];
		if (taken.has(target.id)) continue;
		taken.add(target.id);
		const next: LocalHistory = {
			...h,
			chapterId: target.id,
			chapterName: target.name || h.chapterName,
			updatedAt: now,
			deleted: false
		};
		plan.migrated.push(next);
		plan.remap.set(h.chapterId, next);
		// Tombstone the old key so sync propagates the re-key to other devices.
		plan.writes.push(next, { ...h, deleted: true, updatedAt: now });
	}
	return plan;
}
