export type OfflineChapter = {
	chapterId: number;
	mangaId: number;
	mangaTitle: string;
	chapterName: string;
	pageUrls: string[];
	pageCount: number;
	cachedAt: number;
	thumbnailUrl?: string | null;
	sourceId?: string | null;
};

const DB_NAME = 'komik-reader-offline';
const DB_VERSION = 1;
const STORE = 'chapters';

// Reused across calls instead of opening a fresh connection per operation.
let dbPromise: Promise<IDBDatabase> | null = null;

// See the twin in $lib/local/db.ts: a blocked version bump otherwise leaves the
// open request — and everything awaiting it — pending forever.
const BLOCKED_TIMEOUT_MS = 5000;

function openDb(): Promise<IDBDatabase> {
	if (!dbPromise) {
		dbPromise = new Promise((resolve, reject) => {
			const req = indexedDB.open(DB_NAME, DB_VERSION);
			let blockedTimer: ReturnType<typeof setTimeout> | null = null;
			const clearBlocked = () => {
				if (blockedTimer) {
					clearTimeout(blockedTimer);
					blockedTimer = null;
				}
			};
			req.onblocked = () => {
				clearBlocked();
				blockedTimer = setTimeout(() => {
					dbPromise = null;
					reject(
						new Error(
							'Database offline terkunci tab lain. Tutup tab Komik Reader yang masih terbuka lalu muat ulang.'
						)
					);
				}, BLOCKED_TIMEOUT_MS);
			};
			req.onerror = () => {
				clearBlocked();
				dbPromise = null;
				reject(req.error);
			};
			req.onsuccess = () => {
				clearBlocked();
				const db = req.result;
				// Close on another tab's upgrade so we don't block it.
				db.onversionchange = () => {
					db.close();
					dbPromise = null;
				};
				db.onclose = () => {
					dbPromise = null;
				};
				resolve(db);
			};
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(STORE)) {
					db.createObjectStore(STORE, { keyPath: 'chapterId' });
				}
			};
		});
	}
	return dbPromise;
}

export async function saveOfflineChapter(chapter: OfflineChapter): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(chapter);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'));
	});
}

export async function getOfflineChapter(chapterId: number): Promise<OfflineChapter | null> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).get(chapterId);
		req.onsuccess = () => resolve((req.result as OfflineChapter) ?? null);
		req.onerror = () => reject(req.error);
		tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'));
	});
}

export async function listOfflineChapters(): Promise<OfflineChapter[]> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).getAll();
		req.onsuccess = () => {
			const items = (req.result as OfflineChapter[]).sort((a, b) => b.cachedAt - a.cachedAt);
			resolve(items);
		};
		req.onerror = () => reject(req.error);
		tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'));
	});
}

export async function removeOfflineChapter(chapterId: number): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).delete(chapterId);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'));
	});
}

export async function isChapterCachedOffline(chapterId: number): Promise<boolean> {
	const chapter = await getOfflineChapter(chapterId);
	return chapter !== null;
}