import { browser } from '$app/environment';
import { getAll, getMeta, putItem, putMany, setMeta, updateItem } from './db';
import { planChapterIdMigration, type LiveChapter } from './migrate';
import type { LocalHistory, LocalLibrary, LocalCategory, LocalReadtime } from './types';

export type LocalDataExport = {
	version: 1;
	exportedAt: number;
	history: LocalHistory[];
	library: LocalLibrary[];
	categories: LocalCategory[];
	readtime: LocalReadtime[];
};

const nowMs = () => Date.now();

const DEVICE_ID_KEY = 'deviceId';

function makeDeviceId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return `dev-${nowMs()}-${Math.random().toString(36).slice(2, 10)}`;
}

class LocalData {
	history = $state<LocalHistory[]>([]);
	library = $state<LocalLibrary[]>([]);
	categories = $state<LocalCategory[]>([]);
	/** Per-device reading time pulled from the account (includes this device's echo). */
	readtime = $state<LocalReadtime[]>([]);
	ready = $state(false);
	/** Stable id for this browser/device, minted on first run. */
	deviceId = $state('');

	librarySet = $derived(new Set(this.library.map((l) => l.mangaId)));

	/**
	 * Reading ms contributed by OTHER devices, summed per chapter. Own-device time
	 * lives in `history[].timeSpentMs` (freshest, unflushed included), so we drop
	 * our own echoed rows here to avoid double-counting.
	 */
	otherMsByChapter = $derived.by(() => {
		const map = new Map<number, number>();
		for (const r of this.readtime) {
			if (r.deleted || r.deviceId === this.deviceId) continue;
			map.set(r.chapterId, (map.get(r.chapterId) ?? 0) + (r.ms ?? 0));
		}
		return map;
	});

	#readyPromise: Promise<void> | null = null;
	#syncTrigger: (() => void) | null = null;

	/** The sync engine registers itself here; mutations schedule a sync. */
	setSyncTrigger(fn: () => void) {
		this.#syncTrigger = fn;
	}
	#changed() {
		this.#syncTrigger?.();
	}

	// Callers that need hydrated data (e.g. the reader resolving a resume
	// position on a cold start) await this — a second call must wait for the
	// FIRST hydration to finish, not return early while it's still in flight.
	init(): Promise<void> {
		if (!browser) return Promise.resolve();
		if (!this.#readyPromise) {
			this.#readyPromise = Promise.all([this.#loadDeviceId(), this.reload()]).then(() => {
				this.ready = true;
			});
		}
		return this.#readyPromise;
	}

	async #loadDeviceId() {
		let id = await getMeta<string>(DEVICE_ID_KEY);
		if (!id) {
			id = makeDeviceId();
			await setMeta(DEVICE_ID_KEY, id);
		}
		this.deviceId = id;
	}

	/** Rebuild reactive caches from IndexedDB (used after local + remote writes). */
	async reload() {
		if (!browser) return;
		const [h, l, c, rt] = await Promise.all([
			getAll<LocalHistory>('history'),
			getAll<LocalLibrary>('library'),
			getAll<LocalCategory>('categories'),
			getAll<LocalReadtime>('readtime')
		]);
		this.history = h.filter((x) => !x.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
		this.library = l.filter((x) => !x.deleted).sort((a, b) => b.addedAt - a.addedAt);
		this.categories = c.filter((x) => !x.deleted).sort((a, b) => a.order - b.order);
		this.readtime = rt;
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
		lastPageProgress?: number;
	}) {
		const existing = this.history.find((h) => h.chapterId === entry.chapterId);
		let row: LocalHistory = {
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
		// Atomic against the DB row: progress fields come from `entry`
		// (authoritative), but timeSpentMs belongs to addTimeSpent — take it from
		// the row as it exists inside the transaction, or a concurrent time flush
		// gets wiped (this write used to drop the field entirely).
		await updateItem<LocalHistory>('history', entry.chapterId, (current) => {
			row = { ...row, timeSpentMs: current?.timeSpentMs ?? existing?.timeSpentMs };
			return row;
		});
		this.history = [row, ...this.history.filter((h) => h.chapterId !== row.chapterId)].sort(
			(a, b) => b.updatedAt - a.updatedAt
		);
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
			deleted: false,
			timeSpentMs: existing?.timeSpentMs,
			totalPages: existing?.totalPages
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
				deleted: false,
				timeSpentMs: existing?.timeSpentMs,
				totalPages: existing?.totalPages
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

	/**
	 * Add `deltaMs` to a chapter's accumulated `timeSpentMs`. Bumps `updatedAt`
	 * so the sync engine sees a new row version (and so per-row LWW works on
	 * other fields too). Schedules a sync: the raw field stays device-local but
	 * the engine mirrors it into a per-device `readtime` row (see sync.svelte.ts).
	 *
	 * MUST be an atomic read-modify-write against the DB row, not the in-memory
	 * snapshot: reportWebtoonPage fires recordHistory() and readingTimer.flush()
	 * back to back, and while recordHistory's write is still in flight the
	 * memory snapshot holds the OLD lastPage/isRead — spreading that snapshot
	 * into a plain put wrote the stale progress straight back over the fresh
	 * row. That clobber is why finished webtoon chapters kept isRead=false with
	 * a stale position and reopened at their end.
	 */
	async addTimeSpent(chapterId: number, deltaMs: number) {
		if (deltaMs <= 0) return;
		if (!this.history.find((h) => h.chapterId === chapterId)) return; // no history yet
		let written: LocalHistory | null = null;
		await updateItem<LocalHistory>('history', chapterId, (current) => {
			if (!current) return null; // row vanished (cleared) — nothing to add time to
			written = {
				...current,
				timeSpentMs: (current.timeSpentMs ?? 0) + deltaMs,
				updatedAt: nowMs()
			};
			return written;
		});
		if (written) {
			// Merge only the fields this write owns into memory — the memory row
			// may carry fresher progress than `written`'s base if recordHistory's
			// own memory update raced in between.
			const { timeSpentMs, updatedAt } = written as LocalHistory;
			this.history = this.history.map((h) =>
				h.chapterId === chapterId ? { ...h, timeSpentMs, updatedAt } : h
			);
		}
		this.#changed();
	}

	/**
	 * Re-key history rows whose chapterId no longer exists in the live chapter
	 * list (Suwayomi re-created the row with a new id after a source re-upload)
	 * onto the live chapter with the same chapterNumber. Returns the migrated
	 * rows so callers can re-assert read/progress state on the server for the
	 * new ids. See migrate.ts for the matching rules.
	 */
	async migrateChapterIds(mangaId: number, chapters: LiveChapter[]): Promise<LocalHistory[]> {
		const { writes, migrated, remap } = planChapterIdMigration(
			mangaId,
			chapters,
			this.history,
			nowMs()
		);
		if (!migrated.length) return [];
		await putMany('history', writes);
		this.history = this.history
			.map((h) => remap.get(h.chapterId) ?? h)
			.sort((a, b) => b.updatedAt - a.updatedAt);
		this.#changed();
		return migrated;
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

	/** Tombstone every history row across all manga ("hapus semua riwayat"). */
	async clearAllHistory() {
		const rows = this.history;
		if (!rows.length) return;
		const ts = nowMs();
		await putMany(
			'history',
			rows.map((r) => ({ ...r, deleted: true, updatedAt: ts }))
		);
		this.history = [];
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

	// ── Export / Import ──────────────────────────────────────────────────────
	/** Dump every local-first store for backup or device-to-device transfer. */
	async exportData(): Promise<LocalDataExport> {
		const [history, library, categories, readtime] = await Promise.all([
			getAll<LocalHistory>('history'),
			getAll<LocalLibrary>('library'),
			getAll<LocalCategory>('categories'),
			getAll<LocalReadtime>('readtime')
		]);
		return { version: 1, exportedAt: nowMs(), history, library, categories, readtime };
	}

	/**
	 * Merge an export back in. Last-write-wins by `updatedAt` per row (same rule
	 * the sync engine uses), so importing an older backup can't clobber newer
	 * local changes — safe to import repeatedly or onto a partially-seeded device.
	 */
	async importData(dump: LocalDataExport) {
		function newer<T extends { updatedAt: number }>(
			incoming: T[],
			existingByKey: Map<string, T>,
			keyOf: (row: T) => string
		): T[] {
			return incoming.filter((row) => {
				const existing = existingByKey.get(keyOf(row));
				return !existing || row.updatedAt > existing.updatedAt;
			});
		}

		const existingHistory = new Map(this.history.map((h) => [String(h.chapterId), h]));
		const existingLibrary = new Map(this.library.map((l) => [String(l.mangaId), l]));
		const existingCategories = new Map(this.categories.map((c) => [String(c.id), c]));
		const existingReadtime = new Map(this.readtime.map((r) => [r.key, r]));

		await Promise.all([
			putMany('history', newer(dump.history ?? [], existingHistory, (r) => String(r.chapterId))),
			putMany('library', newer(dump.library ?? [], existingLibrary, (r) => String(r.mangaId))),
			putMany(
				'categories',
				newer(dump.categories ?? [], existingCategories, (r) => String(r.id))
			),
			putMany('readtime', newer(dump.readtime ?? [], existingReadtime, (r) => r.key))
		]);
		await this.reload();
		this.#changed();
	}
}

export const localData = new LocalData();
