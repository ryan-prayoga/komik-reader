// Library update checker — device-local IndexedDB snapshots + batch fetch
// against Suwayomi. Not account-synced (each device can check independently).

import { browser } from '$app/environment';
import { fetchChapters } from '$lib/graphql/api';
import type { Chapter } from '$lib/graphql/types';
import { deleteItem, getAll, putItem } from '$lib/local/db';
import { localData } from '$lib/local/data.svelte';
import type { LocalUpdateMeta } from '$lib/local/types';

export type UpdateListItem = LocalUpdateMeta & {
	hasUpdate: boolean;
};

function nowMs() {
	return Date.now();
}

/** Newest chapter first (same sort as fetchChapters / getMangaChapters). */
function pickLatest(chapters: Chapter[]): Chapter | null {
	if (!chapters.length) return null;
	return chapters[0] ?? null;
}

function isNewer(latestNum: number, latestId: number | null, seenNum: number, seenId: number | null): boolean {
	if (latestNum > seenNum) return true;
	if (latestNum < seenNum) return false;
	// Same number — treat a different id as newer when we have both ids.
	if (latestId != null && seenId != null && latestId !== seenId) return true;
	return false;
}

function toItem(row: LocalUpdateMeta): UpdateListItem {
	return {
		...row,
		hasUpdate: isNewer(
			row.latestChapterNumber,
			row.latestChapterId,
			row.seenChapterNumber,
			row.seenChapterId
		)
	};
}

class UpdatesEngine {
	items = $state<LocalUpdateMeta[]>([]);
	ready = $state(false);
	checking = $state(false);
	/** Progress while checkAll runs: done / total */
	progress = $state({ done: 0, total: 0 });
	lastError = $state('');

	#readyPromise: Promise<void> | null = null;
	#abort = false;

	withUpdates = $derived(this.items.map(toItem).filter((i) => i.hasUpdate));
	updateCount = $derived(this.withUpdates.length);
	updateIds = $derived(new Set(this.withUpdates.map((i) => i.mangaId)));

	init(): Promise<void> {
		if (!browser) return Promise.resolve();
		if (!this.#readyPromise) {
			this.#readyPromise = this.reload().then(() => {
				this.ready = true;
			});
		}
		return this.#readyPromise;
	}

	async reload() {
		if (!browser) return;
		const rows = await getAll<LocalUpdateMeta>('updates');
		this.items = rows.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	get(mangaId: number): UpdateListItem | null {
		const row = this.items.find((i) => i.mangaId === mangaId);
		return row ? toItem(row) : null;
	}

	hasUpdate(mangaId: number): boolean {
		return this.updateIds.has(mangaId);
	}

	async #save(row: LocalUpdateMeta) {
		await putItem('updates', row);
		this.items = [row, ...this.items.filter((i) => i.mangaId !== row.mangaId)].sort(
			(a, b) => b.updatedAt - a.updatedAt
		);
	}

	/**
	 * Record the latest chapter from a known chapter list (detail page / reader).
	 * First seed always sets seen = latest (no false-positive "update").
	 * Pass `markSeen: true` when the user opens the detail page so badges clear.
	 * Pass `mangaStatus` when known so Lanjut Baca can distinguish SELESAI vs NUNGGU.
	 */
	async seedFromChapters(
		manga: {
			mangaId: number;
			title: string;
			thumbnailUrl: string | null;
			sourceId?: string | null;
			mangaStatus?: string | null;
		},
		chapters: Chapter[],
		opts: { markSeen?: boolean } = {}
	) {
		if (!browser || !chapters.length) return;
		await this.init();
		const latest = pickLatest(chapters);
		if (!latest) return;
		const existing = this.items.find((i) => i.mangaId === manga.mangaId);
		const applySeen = opts.markSeen === true || !existing;
		const ts = nowMs();
		const row: LocalUpdateMeta = {
			mangaId: manga.mangaId,
			title: manga.title || existing?.title || '',
			thumbnailUrl: manga.thumbnailUrl ?? existing?.thumbnailUrl ?? null,
			sourceId: manga.sourceId ?? existing?.sourceId ?? null,
			latestChapterId: latest.id,
			latestChapterNumber: latest.chapterNumber,
			latestChapterName: latest.name,
			seenChapterId: applySeen ? latest.id : (existing?.seenChapterId ?? latest.id),
			seenChapterNumber: applySeen
				? latest.chapterNumber
				: (existing?.seenChapterNumber ?? latest.chapterNumber),
			mangaStatus: manga.mangaStatus ?? existing?.mangaStatus ?? null,
			lastCheckedAt: ts,
			updatedAt: ts
		};
		await this.#save(row);
	}

	/** Clear the update badge without re-fetching (user opened detail). */
	async markSeen(mangaId: number) {
		await this.init();
		const existing = this.items.find((i) => i.mangaId === mangaId);
		if (!existing) return;
		if (
			existing.seenChapterId === existing.latestChapterId &&
			existing.seenChapterNumber === existing.latestChapterNumber
		) {
			return;
		}
		const row: LocalUpdateMeta = {
			...existing,
			seenChapterId: existing.latestChapterId,
			seenChapterNumber: existing.latestChapterNumber,
			updatedAt: nowMs()
		};
		await this.#save(row);
	}

	async checkOne(
		manga: {
			mangaId: number;
			title: string;
			thumbnailUrl: string | null;
			sourceId?: string | null;
			mangaStatus?: string | null;
		},
		opts: { markSeenIfFirst?: boolean } = {}
	): Promise<UpdateListItem | null> {
		if (!browser) return null;
		await this.init();
		const existing = this.items.find((i) => i.mangaId === manga.mangaId);
		try {
			const chapters = await fetchChapters(manga.mangaId);
			const latest = pickLatest(chapters);
			const ts = nowMs();
			if (!latest) {
				const empty: LocalUpdateMeta = {
					mangaId: manga.mangaId,
					title: manga.title || existing?.title || '',
					thumbnailUrl: manga.thumbnailUrl ?? existing?.thumbnailUrl ?? null,
					sourceId: manga.sourceId ?? existing?.sourceId ?? null,
					latestChapterId: null,
					latestChapterNumber: 0,
					latestChapterName: '',
					seenChapterId: existing?.seenChapterId ?? null,
					seenChapterNumber: existing?.seenChapterNumber ?? 0,
					mangaStatus: manga.mangaStatus ?? existing?.mangaStatus ?? null,
					lastCheckedAt: ts,
					updatedAt: ts
				};
				await this.#save(empty);
				return toItem(empty);
			}
			const first = !existing && (opts.markSeenIfFirst ?? true);
			const row: LocalUpdateMeta = {
				mangaId: manga.mangaId,
				title: manga.title || existing?.title || '',
				thumbnailUrl: manga.thumbnailUrl ?? existing?.thumbnailUrl ?? null,
				sourceId: manga.sourceId ?? existing?.sourceId ?? null,
				latestChapterId: latest.id,
				latestChapterNumber: latest.chapterNumber,
				latestChapterName: latest.name,
				seenChapterId: first ? latest.id : (existing?.seenChapterId ?? latest.id),
				seenChapterNumber: first
					? latest.chapterNumber
					: (existing?.seenChapterNumber ?? latest.chapterNumber),
				mangaStatus: manga.mangaStatus ?? existing?.mangaStatus ?? null,
				lastCheckedAt: ts,
				updatedAt: ts
			};
			await this.#save(row);
			return toItem(row);
		} catch (e) {
			this.lastError = e instanceof Error ? e.message : 'Gagal cek update';
			return existing ? toItem(existing) : null;
		}
	}

	/** Fan-out check for every library entry. Cancel with stopCheck(). */
	async checkAll(concurrency = 3): Promise<{ found: number; failed: number }> {
		if (!browser || this.checking) return { found: 0, failed: 0 };
		await this.init();
		await localData.init();
		const targets = localData.library;
		if (!targets.length) {
			this.progress = { done: 0, total: 0 };
			return { found: 0, failed: 0 };
		}

		this.checking = true;
		this.#abort = false;
		this.lastError = '';
		this.progress = { done: 0, total: targets.length };
		let failed = 0;
		let found = 0;
		let idx = 0;

		const worker = async () => {
			while (!this.#abort) {
				const i = idx++;
				if (i >= targets.length) return;
				const m = targets[i];
				try {
					const result = await this.checkOne(
						{
							mangaId: m.mangaId,
							title: m.title,
							thumbnailUrl: m.thumbnailUrl,
							sourceId: m.sourceId
						},
						{ markSeenIfFirst: true }
					);
					if (result?.hasUpdate) found += 1;
				} catch {
					failed += 1;
				} finally {
					this.progress = { done: this.progress.done + 1, total: targets.length };
				}
			}
		};

		try {
			await Promise.all(
				Array.from({ length: Math.min(concurrency, targets.length) }, () => worker())
			);
		} finally {
			this.checking = false;
		}
		return { found, failed };
	}

	stopCheck() {
		this.#abort = true;
	}

	/** Drop update meta when manga leaves the library. */
	async remove(mangaId: number) {
		await this.init();
		if (!this.items.some((i) => i.mangaId === mangaId)) return;
		this.items = this.items.filter((i) => i.mangaId !== mangaId);
		await deleteItem('updates', mangaId).catch(() => {});
	}
}

export const updates = new UpdatesEngine();
