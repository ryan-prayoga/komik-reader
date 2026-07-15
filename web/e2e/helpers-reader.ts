import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { firstSourceId } from './helpers';

export type OpenedChapter = {
	readonly chapterId: number;
	readonly mangaId: number;
	readonly pageCount: number;
};

/** Resolve a chapter that has at least `minPages` pages via GraphQL + page fetch. */
export async function resolveReadableChapter(
	request: APIRequestContext,
	minPages = 3
): Promise<OpenedChapter | null> {
	const sourceId = await firstSourceId(request);
	if (!sourceId) return null;

	const mangaRes = await request.post('/api/graphql', {
		data: {
			query: `mutation($id: LongString!) {
        fetchSourceManga(input: { source: $id, type: POPULAR, page: 1 }) {
          mangas { id }
        }
      }`,
			variables: { id: sourceId }
		}
	});
	if (!mangaRes.ok()) return null;
	const mangaJson = (await mangaRes.json()) as {
		data?: { fetchSourceManga?: { mangas?: { id: number }[] } };
	};
	const mangas = mangaJson.data?.fetchSourceManga?.mangas ?? [];

	for (const m of mangas.slice(0, 8)) {
		// Ensure chapters exist on server (fetch), then read list.
		await request.post('/api/graphql', {
			data: {
				query: `mutation($id: Int!) {
          fetchChapters(input: { mangaId: $id }) {
            chapters { id }
          }
        }`,
				variables: { id: m.id }
			}
		});
		const chRes = await request.post('/api/graphql', {
			data: {
				query: `query($id: Int!) {
          manga(id: $id) {
            chapters {
              nodes { id name pageCount sourceOrder }
            }
          }
        }`,
				variables: { id: m.id }
			}
		});
		if (!chRes.ok()) continue;
		const chJson = (await chRes.json()) as {
			data?: {
				manga?: {
					chapters?: {
						nodes?: { id: number; name: string; pageCount?: number; sourceOrder?: number }[];
					};
				};
			};
		};
		const chapters = [...(chJson.data?.manga?.chapters?.nodes ?? [])].sort(
			(a, b) => (b.sourceOrder ?? 0) - (a.sourceOrder ?? 0)
		);
		// Prefer mid-series chapters with known pageCount when available.
		const candidates = [...chapters].reverse();
		for (const ch of candidates.slice(0, 12)) {
			const pagesRes = await request.post('/api/graphql', {
				data: {
					query: `mutation($chapterId: Int!) {
            fetchChapterPages(input: { chapterId: $chapterId }) {
              pages
            }
          }`,
					variables: { chapterId: ch.id }
				}
			});
			if (!pagesRes.ok()) continue;
			const pagesJson = (await pagesRes.json()) as {
				data?: { fetchChapterPages?: { pages?: string[] } };
			};
			const pages = pagesJson.data?.fetchChapterPages?.pages ?? [];
			if (pages.length >= minPages) {
				return { chapterId: ch.id, mangaId: m.id, pageCount: pages.length };
			}
		}
	}
	return null;
}

export async function openWebtoonReader(page: Page, chapterId: number) {
	await page.goto(`/read/${chapterId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
	await expect(page).toHaveURL(new RegExp(`/read/${chapterId}`));
	// Webtoon scroller is the real surface (position:fixed).
	const scroller = page.locator('[data-reader-scroll]');
	await expect(scroller).toBeVisible({ timeout: 60_000 });
	// At least one page container mounted.
	await expect
		.poll(async () => page.locator('[data-page-key]').count(), { timeout: 60_000 })
		.toBeGreaterThan(0);
	return scroller;
}

export async function readLocalHistory(page: Page, chapterId: number) {
	return page.evaluate(async (id) => {
		return new Promise<{
			lastPage?: number;
			lastPageProgress?: number;
			isRead?: boolean;
			totalPages?: number;
		} | null>((resolve) => {
			const req = indexedDB.open('komik-reader-data', 3);
			req.onerror = () => resolve(null);
			req.onsuccess = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains('history')) {
					resolve(null);
					return;
				}
				const tx = db.transaction('history', 'readonly');
				const store = tx.objectStore('history');
				const get = store.get(id);
				get.onsuccess = () => {
					const row = get.result as
						| {
								lastPage?: number;
								lastPageProgress?: number;
								isRead?: boolean;
								totalPages?: number;
						  }
						| undefined;
					resolve(row ?? null);
				};
				get.onerror = () => resolve(null);
			};
		});
	}, chapterId);
}

/** Force-hide tab path: visibilitychange → flush progress. */
export async function simulateBackgroundFlush(page: Page) {
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'hidden'
		});
		document.dispatchEvent(new Event('visibilitychange'));
		window.dispatchEvent(new Event('pagehide'));
	});
	// Give IndexedDB a beat.
	await page.waitForTimeout(400);
}
