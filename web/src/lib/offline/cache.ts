import { apiUrl } from '$lib/graphql/client';
import { fetchChapterPages } from '$lib/graphql/api';
import {
	getOfflineChapter,
	removeOfflineChapter,
	saveOfflineChapter,
	type OfflineChapter
} from './db';

const CACHE_NAME = 'komik-pages-v1';

async function openCache(): Promise<Cache> {
	return caches.open(CACHE_NAME);
}

export async function cacheChapterToDevice(
	chapterId: number,
	mangaId: number,
	mangaTitle: string,
	chapterName: string,
	onProgress?: (done: number, total: number) => void
): Promise<OfflineChapter> {
	const pageUrls = await fetchChapterPages(chapterId);
	if (pageUrls.length === 0) throw new Error('Chapter tidak punya halaman');

	const cache = await openCache();
	let done = 0;

	for (const pageUrl of pageUrls) {
		const url = apiUrl(pageUrl);
		const existing = await cache.match(url);
		if (!existing) {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`Gagal cache halaman: HTTP ${res.status}`);
			await cache.put(url, res.clone());
		}
		done += 1;
		onProgress?.(done, pageUrls.length);
	}

	const record: OfflineChapter = {
		chapterId,
		mangaId,
		mangaTitle,
		chapterName,
		pageUrls,
		pageCount: pageUrls.length,
		cachedAt: Date.now()
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