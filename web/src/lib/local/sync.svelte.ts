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
					// Strip `timeSpentMs` from the shared history row: LWW would clobber
					// another device's total. Reading time is synced separately as
					// per-device `readtime` rows (emitted below) instead.
					const { timeSpentMs: _omit, ...payload } = r as Record<string, unknown>;
					local.push({
						entity,
						itemKey: key(r as never),
						data: payload,
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

		// Mirror this device's reading time into per-device `readtime` rows so the
		// server can add up every device's contribution. A device only ever writes
		// its own `${chapterId}:${deviceId}` key and its `ms` only grows, so plain
		// LWW by updatedAt is safe here (unlike LWW on a shared timeSpentMs field).
		const deviceId = localData.deviceId;
		if (deviceId) {
			for (const r of h) {
				const ms = r.timeSpentMs ?? 0;
				if (r.updatedAt > pushCursor && ms > 0) {
					local.push({
						entity: 'readtime',
						itemKey: `${r.chapterId}:${deviceId}`,
						data: { chapterId: r.chapterId, deviceId, ms },
						updatedAt: r.updatedAt,
						deleted: false
					});
				}
			}
		}

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

			if (store === 'readtime') {
				// String composite key `${chapterId}:${deviceId}`; not our push cursor
				// to advance (remote clocks), so don't touch maxCursor here.
				const existing = await getItem<{ updatedAt: number }>('readtime', ch.itemKey);
				if (!existing || ch.updatedAt > existing.updatedAt) {
					await putItem('readtime', {
						...(ch.data as Record<string, unknown>),
						key: ch.itemKey,
						updatedAt: ch.updatedAt,
						deleted: ch.deleted
					});
					applied = true;
				}
				continue;
			}

			const existing = await getItem<{ updatedAt: number }>(store, Number(ch.itemKey));
			if (!existing || ch.updatedAt > existing.updatedAt) {
				// Preserve the device-local `timeSpentMs` — never let a remote
				// change overwrite it (and a remote change shouldn't carry it
				// anyway because we strip it on push).
				const merged =
					store === 'history' && existing && 'timeSpentMs' in (existing as Record<string, unknown>)
						? { ...(ch.data as Record<string, unknown>), timeSpentMs: (existing as { timeSpentMs?: number }).timeSpentMs }
						: ch.data;
				await putItem(store, merged);
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
