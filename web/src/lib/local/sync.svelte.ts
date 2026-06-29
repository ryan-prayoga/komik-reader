import { browser } from '$app/environment';
import { getAll, getItem, putItem, getMeta, setMeta } from './db';
import { localData } from './data.svelte';
import type { LocalHistory, LocalLibrary, LocalCategory, SyncChange, SyncEntity } from './types';

const PUSH_KEY = 'syncPushCursor'; // max local updatedAt already pushed (client clock)
const PULL_KEY = 'syncPullCursor'; // server changefeed seq already pulled

class SyncEngine {
	loggedIn = $state(false);
	syncing = $state(false);
	lastSyncedAt = $state<number | null>(null);

	#pending = false;
	#timer: ReturnType<typeof setTimeout> | null = null;

	/** Wire mutations → debounced sync. Call once on app start. */
	start(loggedIn: boolean) {
		this.loggedIn = loggedIn;
		localData.setSyncTrigger(() => this.schedule());
		if (loggedIn) {
			this.schedule(0);
			if (browser) {
				window.addEventListener('online', () => this.schedule(0));
				document.addEventListener('visibilitychange', () => {
					if (document.visibilityState === 'visible') this.schedule(0);
				});
			}
		}
	}

	schedule(delay = 1500) {
		if (!browser || !this.loggedIn) return;
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.run(), delay);
	}

	async run() {
		if (!browser || !this.loggedIn || this.syncing) {
			if (this.syncing) this.#pending = true;
			return;
		}
		this.syncing = true;
		try {
			await this.#sync();
			this.lastSyncedAt = Date.now();
		} catch {
			// best-effort; a later change or visibility event retries
		} finally {
			this.syncing = false;
			if (this.#pending) {
				this.#pending = false;
				this.schedule(500);
			}
		}
	}

	async #sync() {
		const pushCursor = (await getMeta<number>(PUSH_KEY)) ?? 0;
		const pullCursor = (await getMeta<number>(PULL_KEY)) ?? 0;

		const [h, l, c] = await Promise.all([
			getAll<LocalHistory>('history'),
			getAll<LocalLibrary>('library'),
			getAll<LocalCategory>('categories')
		]);

		const local: SyncChange[] = [];
		let maxCursor = pushCursor;
		const collect = (
			entity: SyncEntity,
			rows: { updatedAt: number; deleted?: boolean }[],
			key: (r: never) => string
		) => {
			for (const r of rows) {
				if (r.updatedAt > pushCursor) {
					local.push({
						entity,
						itemKey: key(r as never),
						data: r,
						updatedAt: r.updatedAt,
						deleted: !!r.deleted
					});
					if (r.updatedAt > maxCursor) maxCursor = r.updatedAt;
				}
			}
		};
		collect('history', h, (r: LocalHistory) => String(r.chapterId));
		collect('library', l, (r: LocalLibrary) => String(r.mangaId));
		collect('categories', c, (r: LocalCategory) => String(r.id));

		const res = await fetch('/api/sync', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ since: pullCursor, changes: local })
		});
		if (res.status === 401) {
			this.loggedIn = false;
			return;
		}
		if (!res.ok) throw new Error('sync failed');

		const result = (await res.json()) as { changes: SyncChange[]; cursor: number };

		let applied = false;
		for (const ch of result.changes) {
			const store = ch.entity as SyncEntity;
			const existing = await getItem<{ updatedAt: number }>(store, Number(ch.itemKey));
			if (!existing || ch.updatedAt > existing.updatedAt) {
				await putItem(store, ch.data);
				applied = true;
				if (ch.updatedAt > maxCursor) maxCursor = ch.updatedAt;
			}
		}

		await setMeta(PUSH_KEY, maxCursor);
		await setMeta(PULL_KEY, result.cursor);
		if (applied) await localData.reload();
	}
}

export const syncEngine = new SyncEngine();
