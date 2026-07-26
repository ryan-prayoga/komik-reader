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

// Reused across calls instead of opening a fresh connection per operation —
// reading/webtoon scrolling can trigger many writes per minute. Cleared on
// error/close so a later call reopens rather than reusing a dead handle.
let dbPromise: Promise<IDBDatabase> | null = null;

// How long to wait on a blocked upgrade before giving up. A version bump can
// only proceed once every other connection closes; without a deadline the open
// request just sits there, and since app start awaits localData.init(), the
// whole UI hangs on a shimmer with no error to show.
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
			// Another connection (usually a tab still running the pre-deploy build,
			// which has no onversionchange handler to close itself) is holding the
			// old version open.
			req.onblocked = () => {
				clearBlocked();
				blockedTimer = setTimeout(() => {
					dbPromise = null;
					reject(
						new Error(
							'Database lokal terkunci tab lain. Tutup tab Komik Reader yang masih terbuka lalu muat ulang.'
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
				// Step out of the way when another tab needs to upgrade, so we are
				// not the connection blocking it.
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
				for (const [store, keyPath] of Object.entries(STORES)) {
					if (!db.objectStoreNames.contains(store)) {
						db.createObjectStore(store, { keyPath });
					}
				}
			};
		});
	}
	return dbPromise;
}

export async function putItem<T>(store: LocalStore, value: T): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, 'readwrite');
		tx.objectStore(store).put(value);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		// An abort (quota exceeded, a throwing handler, the connection closing
		// under us) fires neither of the above — without this the promise never
		// settles and its awaiter hangs for the life of the page.
		tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'));
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
		// An abort (quota exceeded, a throwing handler, the connection closing
		// under us) fires neither of the above — without this the promise never
		// settles and its awaiter hangs for the life of the page.
		tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'));
	});
}

/**
 * Atomic read-modify-write on a single row, inside ONE readwrite transaction.
 * Use this when the new value derives from the current one (e.g. incrementing
 * `timeSpentMs`) — deriving it from an in-memory snapshot instead races with
 * concurrent writers and resurrects whatever stale fields the snapshot held.
 */
export async function updateItem<T>(
	store: LocalStore,
	key: IDBValidKey,
	fn: (current: T | null) => T | null
): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, 'readwrite');
		const os = tx.objectStore(store);
		const req = os.get(key);
		req.onsuccess = () => {
			const next = fn((req.result as T) ?? null);
			if (next !== null) os.put(next);
		};
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		// An abort (quota exceeded, a throwing handler, the connection closing
		// under us) fires neither of the above — without this the promise never
		// settles and its awaiter hangs for the life of the page.
		tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'));
	});
}

export async function getAll<T>(store: LocalStore): Promise<T[]> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, 'readonly');
		const req = tx.objectStore(store).getAll();
		req.onsuccess = () => resolve((req.result as T[]) ?? []);
		req.onerror = () => reject(req.error);
		tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'));
	});
}

export async function getItem<T>(store: LocalStore, key: IDBValidKey): Promise<T | null> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, 'readonly');
		const req = tx.objectStore(store).get(key);
		req.onsuccess = () => resolve((req.result as T) ?? null);
		req.onerror = () => reject(req.error);
		tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'));
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
		// An abort (quota exceeded, a throwing handler, the connection closing
		// under us) fires neither of the above — without this the promise never
		// settles and its awaiter hangs for the life of the page.
		tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'));
	});
}
