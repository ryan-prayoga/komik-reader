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

/**
 * Blob URLs handed to the reader for the chapter it currently has open. The
 * reader shows one offline chapter at a time, so a single slot is enough — and
 * it has to be tracked somewhere, since an un-revoked object URL pins its blob
 * in memory for the lifetime of the document.
 */
let handedOut: { chapterId: number; urls: string[] } | null = null;

/** Revoke the object URLs from the last getCachedPageUrls call. */
export function releaseCachedPageUrls(chapterId?: number): void {
	if (!handedOut) return;
	if (chapterId != null && handedOut.chapterId !== chapterId) return;
	for (const url of handedOut.urls) URL.revokeObjectURL(url);
	handedOut = null;
}

/**
 * Read the saved pages back OUT of `komik-offline-v1` as blob URLs.
 *
 * Returning the plain network URLs instead (what this used to do) only *looked*
 * like it worked: the resulting <img> requests are served by the Workbox
 * CacheFirst route, which reads `komik-pages-v1` — an LRU cache with a 5000
 * entry / 30 day cap. So a chapter the user explicitly saved would render fine
 * until that unrelated cache evicted it, then break offline while this function
 * still reported success. Going through the blob keeps saved chapters bound to
 * the cache that is actually never evicted.
 */
export async function getCachedPageUrls(chapterId: number): Promise<string[] | null> {
	const record = await getOfflineChapter(chapterId);
	if (!record) return null;

	const cache = await openCache();
	const urls: string[] = [];

	for (const pageUrl of record.pageUrls) {
		const match = await cache.match(apiUrl(pageUrl));
		if (!match) {
			// All-or-nothing: don't leak the URLs already minted for a chapter the
			// caller is about to be told is unavailable.
			for (const url of urls) URL.revokeObjectURL(url);
			return null;
		}
		urls.push(URL.createObjectURL(await match.blob()));
	}

	releaseCachedPageUrls();
	handedOut = { chapterId, urls };
	return urls;
}

export async function removeChapterFromDevice(chapterId: number): Promise<void> {
	const record = await getOfflineChapter(chapterId);
	if (!record) return;

	releaseCachedPageUrls(chapterId);

	const cache = await openCache();
	for (const pageUrl of record.pageUrls) {
		await cache.delete(apiUrl(pageUrl));
	}

	await removeOfflineChapter(chapterId);
}

/**
 * Availability check only — deliberately does NOT go through getCachedPageUrls,
 * which would mint blob URLs nobody consumes and evict the reader's live ones.
 */
export async function isChapterAvailableOffline(chapterId: number): Promise<boolean> {
	const record = await getOfflineChapter(chapterId);
	if (!record || record.pageUrls.length === 0) return false;

	const cache = await openCache();
	for (const pageUrl of record.pageUrls) {
		if (!(await cache.match(apiUrl(pageUrl)))) return false;
	}
	return true;
}
