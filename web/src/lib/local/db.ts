// Low-level IndexedDB access for local-first data (history/library/categories).
// Separate DB from the offline-chapter cache so versioning stays independent.

const DB_NAME = 'komik-reader-data';
// v2: added `readtime` store (per-device reading time pulled from account sync).
// v3: added `updates` store (per-manga latest/seen chapter snapshot for library badges).
const DB_VERSION = 3;

export type LocalStore = 'history' | 'library' | 'categories' | 'readtime' | 'updates' | 'meta';

const STORES: Record<LocalStore, string> = {
	history: 'chapterId',
	library: 'mangaId',
	categories: 'id',
	// Composite key `${chapterId}:${deviceId}` — one row per (chapter, device).
	readtime: 'key',
	updates: 'mangaId',
	meta: 'key'
};

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onerror = () => reject(req.error);
		req.onsuccess = () => resolve(req.result);
		req.onupgradeneeded = () => {
			const db = req.result;
			for (const [store, keyPath] of Object.entries(STORES)) {
				if (!db.objectStoreNames.contains(store)) {
					db.createObjectStore(store, { keyPath });
				}
			}
		};
	});
}

export async function putItem<T>(store: LocalStore, value: T): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, 'readwrite');
		tx.objectStore(store).put(value);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function putMany<T>(store: LocalStore, values: T[]): Promise<void> {
	if (!values.length) return;
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, 'readwrite');
		const os = tx.objectStore(store);
		for (const v of values) os.put(v);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function getAll<T>(store: LocalStore): Promise<T[]> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, 'readonly');
		const req = tx.objectStore(store).getAll();
		req.onsuccess = () => resolve((req.result as T[]) ?? []);
		req.onerror = () => reject(req.error);
	});
}

export async function getItem<T>(store: LocalStore, key: IDBValidKey): Promise<T | null> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, 'readonly');
		const req = tx.objectStore(store).get(key);
		req.onsuccess = () => resolve((req.result as T) ?? null);
		req.onerror = () => reject(req.error);
	});
}

export async function getMeta<T>(key: string): Promise<T | null> {
	const row = await getItem<{ key: string; value: T }>('meta', key);
	return row ? row.value : null;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
	await putItem('meta', { key, value });
}

export async function deleteItem(store: LocalStore, key: IDBValidKey): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, 'readwrite');
		tx.objectStore(store).delete(key);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}
