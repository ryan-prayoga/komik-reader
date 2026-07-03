import { apiUrl } from '$lib/graphql/client';
import { fetchChapterPages } from '$lib/graphql/api';
import {
	getOfflineChapter,
	removeOfflineChapter,
	saveOfflineChapter,
	type OfflineChapter
} from './db';

// Dedicated cache for user-initiated offline downloads. MUST NOT be the same
// cache Workbox uses for transient page caching (`komik-pages-v1`) — Workbox's
// expiration plugin does LRU eviction there, which would silently purge chapters
// the user explicitly saved for offline.
const CACHE_NAME = 'komik-offline-v1';

// How many page requests to run at once during a download. Parallel enough to
// be fast, bounded so a big chapter doesn't open hundreds of sockets at once.
const DOWNLOAD_CONCURRENCY = 5;

async function openCache(): Promise<Cache> {
	return caches.open(CACHE_NAME);
}

/** Run `worker` over `items` with a bounded concurrency pool. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
	let cursor = 0;
	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (cursor < items.length) {
			const i = cursor++;
			await worker(items[i]);
		}
	});
	await Promise.all(runners);
}

export async function cacheChapterToDevice(
	chapterId: number,
	mangaId: number,
	mangaTitle: string,
	chapterName: string,
	onProgress?: (done: number, total: number) => void,
	thumbnailUrl?: string | null,
	sourceId?: string | null
): Promise<OfflineChapter> {
	const pageUrls = await fetchChapterPages(chapterId);
	if (pageUrls.length === 0) throw new Error('Chapter tidak punya halaman');

	const cache = await openCache();
	const urls = pageUrls.map((p) => apiUrl(p));
	let done = 0;

	try {
		await pool(urls, DOWNLOAD_CONCURRENCY, async (url) => {
			const existing = await cache.match(url);
			if (!existing) {
				const res = await fetch(url);
				if (!res.ok) throw new Error(`Gagal cache halaman: HTTP ${res.status}`);
				await cache.put(url, res.clone());
			}
			done += 1;
			onProgress?.(done, urls.length);
		});
	} catch (e) {
		// Partial download is worthless (getCachedPageUrls is all-or-nothing) and
		// leaves orphaned cache entries — roll back everything we just wrote.
		await Promise.all(urls.map((url) => cache.delete(url).catch(() => {})));
		await removeOfflineChapter(chapterId).catch(() => {});
		throw e;
	}

	const record: OfflineChapter = {
		chapterId,
		mangaId,
		mangaTitle,
		chapterName,
		pageUrls,
		pageCount: pageUrls.length,
		cachedAt: Date.now(),
		thumbnailUrl,
		sourceId
	};

	await saveOfflineChapter(record);
	return record;
}

export async function getCachedPageUrls(chapterId: number): Promise<string[] | null> {
	const record = await getOfflineChapter(chapterId);
	if (!record) return null;

	const cache = await openCache();
	const available: string[] = [];

	for (const pageUrl of record.pageUrls) {
		const url = apiUrl(pageUrl);
		const match = await cache.match(url);
		if (!match) return null;
		available.push(url);
	}

	return available;
}

export async function removeChapterFromDevice(chapterId: number): Promise<void> {
	const record = await getOfflineChapter(chapterId);
	if (!record) return;

	const cache = await openCache();
	for (const pageUrl of record.pageUrls) {
		await cache.delete(apiUrl(pageUrl));
	}

	await removeOfflineChapter(chapterId);
}

export async function isChapterAvailableOffline(chapterId: number): Promise<boolean> {
	const urls = await getCachedPageUrls(chapterId);
	return urls !== null && urls.length > 0;
}
