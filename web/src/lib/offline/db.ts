export type OfflineChapter = {
	chapterId: number;
	mangaId: number;
	mangaTitle: string;
	chapterName: string;
	pageUrls: string[];
	pageCount: number;
	cachedAt: number;
};

const DB_NAME = 'komik-reader-offline';
const DB_VERSION = 1;
const STORE = 'chapters';

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onerror = () => reject(req.error);
		req.onsuccess = () => resolve(req.result);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE, { keyPath: 'chapterId' });
			}
		};
	});
}

export async function saveOfflineChapter(chapter: OfflineChapter): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(chapter);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function getOfflineChapter(chapterId: number): Promise<OfflineChapter | null> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).get(chapterId);
		req.onsuccess = () => resolve((req.result as OfflineChapter) ?? null);
		req.onerror = () => reject(req.error);
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
	});
}

export async function removeOfflineChapter(chapterId: number): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).delete(chapterId);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function isChapterCachedOffline(chapterId: number): Promise<boolean> {
	const chapter = await getOfflineChapter(chapterId);
	return chapter !== null;
}