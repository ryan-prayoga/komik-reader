import { browser } from '$app/environment';
import { getAll, putItem, putMany } from './db';
import type { LocalHistory, LocalLibrary, LocalCategory } from './types';

const nowMs = () => Date.now();

class LocalData {
	history = $state<LocalHistory[]>([]);
	library = $state<LocalLibrary[]>([]);
	categories = $state<LocalCategory[]>([]);
	ready = $state(false);

	librarySet = $derived(new Set(this.library.map((l) => l.mangaId)));

	#initialized = false;
	#syncTrigger: (() => void) | null = null;

	/** The sync engine registers itself here; mutations schedule a sync. */
	setSyncTrigger(fn: () => void) {
		this.#syncTrigger = fn;
	}
	#changed() {
		this.#syncTrigger?.();
	}

	async init() {
		if (!browser || this.#initialized) return;
		this.#initialized = true;
		await this.reload();
		this.ready = true;
	}

	/** Rebuild reactive caches from IndexedDB (used after local + remote writes). */
	async reload() {
		if (!browser) return;
		const [h, l, c] = await Promise.all([
			getAll<LocalHistory>('history'),
			getAll<LocalLibrary>('library'),
			getAll<LocalCategory>('categories')
		]);
		this.history = h.filter((x) => !x.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
		this.library = l.filter((x) => !x.deleted).sort((a, b) => b.addedAt - a.addedAt);
		this.categories = c.filter((x) => !x.deleted).sort((a, b) => a.order - b.order);
	}

	// ── History ──────────────────────────────────────────────────────────────
	async recordHistory(entry: {
		chapterId: number;
		mangaId: number;
		mangaTitle: string;
		thumbnailUrl: string | null;
		chapterName: string;
		lastPage: number;
		isRead: boolean;
		sourceId?: string | null;
		chapterNumber?: number;
		totalPages?: number;
	}) {
		const existing = this.history.find((h) => h.chapterId === entry.chapterId);
		const row: LocalHistory = {
			...entry,
			// Keep richer metadata if a later write lacks it.
			mangaTitle: entry.mangaTitle || existing?.mangaTitle || '',
			thumbnailUrl: entry.thumbnailUrl ?? existing?.thumbnailUrl ?? null,
			sourceId: entry.sourceId ?? existing?.sourceId ?? null,
			chapterNumber: entry.chapterNumber ?? existing?.chapterNumber,
			totalPages: entry.totalPages ?? existing?.totalPages,
			updatedAt: nowMs(),
			deleted: false
		};
		await putItem('history', row);
		this.history = [row, ...this.history.filter((h) => h.chapterId !== row.chapterId)].sort(
			(a, b) => b.updatedAt - a.updatedAt
		);
		this.#changed();
	}

	async setHistoryRead(chapterId: number, isRead: boolean) {
		const row = this.history.find((h) => h.chapterId === chapterId);
		if (!row) return;
		const next = { ...row, isRead, updatedAt: nowMs() };
		await putItem('history', next);
		this.history = this.history.map((h) => (h.chapterId === chapterId ? next : h));
		this.#changed();
	}

	/**
	 * Upsert a single chapter's read flag, creating a history row if absent.
	 * Used by the detail page so read/unread marks persist locally (works for
	 * guests too) and override the server `isRead` in the UI.
	 */
	async setChapterRead(
		entry: {
			chapterId: number;
			mangaId: number;
			mangaTitle: string;
			thumbnailUrl: string | null;
			chapterName: string;
			sourceId?: string | null;
			chapterNumber?: number;
		},
		isRead: boolean
	) {
		const existing = this.history.find((h) => h.chapterId === entry.chapterId);
		const row: LocalHistory = {
			chapterId: entry.chapterId,
			mangaId: entry.mangaId,
			mangaTitle: entry.mangaTitle || existing?.mangaTitle || '',
			thumbnailUrl: entry.thumbnailUrl ?? existing?.thumbnailUrl ?? null,
			chapterName: entry.chapterName || existing?.chapterName || 'Chapter',
			sourceId: entry.sourceId ?? existing?.sourceId ?? null,
			chapterNumber: entry.chapterNumber ?? existing?.chapterNumber,
			lastPage: existing?.lastPage ?? 0,
			isRead,
			updatedAt: nowMs(),
			deleted: false
		};
		await putItem('history', row);
		this.history = [row, ...this.history.filter((h) => h.chapterId !== row.chapterId)].sort(
			(a, b) => b.updatedAt - a.updatedAt
		);
		this.#changed();
	}

	/** Batch read-flag upsert (e.g. "mark all previous as read"). One sync trigger. */
	async setManyChaptersRead(
		entries: Array<{
			chapterId: number;
			mangaId: number;
			mangaTitle: string;
			thumbnailUrl: string | null;
			chapterName: string;
			sourceId?: string | null;
			chapterNumber?: number;
		}>,
		isRead: boolean
	) {
		if (!entries.length) return;
		// Stable, monotonic timestamps: highest chapterNumber lands newest so the
		// per-manga history view resolves the boundary chapter as "last read".
		const base = nowMs();
		const ordered = [...entries].sort(
			(a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0)
		);
		const rows: LocalHistory[] = ordered.map((entry, i) => {
			const existing = this.history.find((h) => h.chapterId === entry.chapterId);
			return {
				chapterId: entry.chapterId,
				mangaId: entry.mangaId,
				mangaTitle: entry.mangaTitle || existing?.mangaTitle || '',
				thumbnailUrl: entry.thumbnailUrl ?? existing?.thumbnailUrl ?? null,
				chapterName: entry.chapterName || existing?.chapterName || 'Chapter',
				sourceId: entry.sourceId ?? existing?.sourceId ?? null,
				chapterNumber: entry.chapterNumber ?? existing?.chapterNumber,
				lastPage: existing?.lastPage ?? 0,
				isRead,
				updatedAt: base + i,
				deleted: false
			};
		});
		await putMany('history', rows);
		const byId = new Map(rows.map((r) => [r.chapterId, r]));
		this.history = [
			...rows,
			...this.history.filter((h) => !byId.has(h.chapterId))
		].sort((a, b) => b.updatedAt - a.updatedAt);
		this.#changed();
	}

	async removeHistory(chapterId: number) {
		const row = this.history.find((h) => h.chapterId === chapterId);
		if (!row) return;
		await putItem('history', { ...row, deleted: true, updatedAt: nowMs() });
		this.history = this.history.filter((h) => h.chapterId !== chapterId);
		this.#changed();
	}

	/** Tombstone every history row for a manga (per-manga delete in Riwayat). */
	async removeHistoryByManga(mangaId: number) {
		const rows = this.history.filter((h) => h.mangaId === mangaId);
		if (!rows.length) return;
		const ts = nowMs();
		await putMany(
			'history',
			rows.map((r) => ({ ...r, deleted: true, updatedAt: ts }))
		);
		this.history = this.history.filter((h) => h.mangaId !== mangaId);
		this.#changed();
	}

	// ── Library ──────────────────────────────────────────────────────────────
	isInLibrary(mangaId: number): boolean {
		return this.librarySet.has(mangaId);
	}

	async addToLibrary(manga: {
		mangaId: number;
		title: string;
		thumbnailUrl: string | null;
		sourceId?: string | null;
	}) {
		const existing = this.library.find((l) => l.mangaId === manga.mangaId);
		const ts = nowMs();
		const row: LocalLibrary = {
			mangaId: manga.mangaId,
			title: manga.title,
			thumbnailUrl: manga.thumbnailUrl,
			sourceId: manga.sourceId ?? existing?.sourceId ?? null,
			categoryIds: existing?.categoryIds ?? [],
			addedAt: existing?.addedAt ?? ts,
			updatedAt: ts,
			deleted: false
		};
		await putItem('library', row);
		this.library = [row, ...this.library.filter((l) => l.mangaId !== row.mangaId)];
		this.#changed();
	}

	async removeFromLibrary(mangaId: number) {
		const row = this.library.find((l) => l.mangaId === mangaId);
		if (!row) return;
		await putItem('library', { ...row, deleted: true, updatedAt: nowMs() });
		this.library = this.library.filter((l) => l.mangaId !== mangaId);
		this.#changed();
	}

	async toggleLibrary(manga: {
		mangaId: number;
		title: string;
		thumbnailUrl: string | null;
		sourceId?: string | null;
	}): Promise<boolean> {
		if (this.isInLibrary(manga.mangaId)) {
			await this.removeFromLibrary(manga.mangaId);
			return false;
		}
		await this.addToLibrary(manga);
		return true;
	}

	async setMangaCategories(mangaId: number, categoryIds: number[]) {
		const row = this.library.find((l) => l.mangaId === mangaId);
		if (!row) return;
		const next = { ...row, categoryIds, updatedAt: nowMs() };
		await putItem('library', next);
		this.library = this.library.map((l) => (l.mangaId === mangaId ? next : l));
		this.#changed();
	}

	// ── Categories ───────────────────────────────────────────────────────────
	async createCategory(name: string): Promise<LocalCategory> {
		const ts = nowMs();
		const row: LocalCategory = {
			id: ts,
			name,
			order: this.categories.length,
			createdAt: ts,
			updatedAt: ts,
			deleted: false
		};
		await putItem('categories', row);
		this.categories = [...this.categories, row];
		this.#changed();
		return row;
	}

	async renameCategory(id: number, name: string) {
		const row = this.categories.find((c) => c.id === id);
		if (!row) return;
		const next = { ...row, name, updatedAt: nowMs() };
		await putItem('categories', next);
		this.categories = this.categories.map((c) => (c.id === id ? next : c));
		this.#changed();
	}

	async deleteCategory(id: number) {
		const row = this.categories.find((c) => c.id === id);
		if (!row) return;
		const ts = nowMs();
		await putItem('categories', { ...row, deleted: true, updatedAt: ts });
		this.categories = this.categories.filter((c) => c.id !== id);
		// Drop the category from any library entries that reference it.
		const affected = this.library
			.filter((l) => l.categoryIds.includes(id))
			.map((l) => ({ ...l, categoryIds: l.categoryIds.filter((c) => c !== id), updatedAt: ts }));
		if (affected.length) {
			await putMany('library', affected);
			const byId = new Map(affected.map((a) => [a.mangaId, a]));
			this.library = this.library.map((l) => byId.get(l.mangaId) ?? l);
		}
		this.#changed();
	}

	mangaInCategory(categoryId: number): LocalLibrary[] {
		return this.library.filter((l) => l.categoryIds.includes(categoryId));
	}
}

export const localData = new LocalData();
