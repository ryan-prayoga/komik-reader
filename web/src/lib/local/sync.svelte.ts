import { browser } from '$app/environment';
import { getAll, getItem, putItem, updateItem, getMeta, setMeta } from './db';
import { localData } from './data.svelte';
import { mergeReadPosition } from './history-merge';
import type { LocalHistory, LocalLibrary, LocalCategory, SyncChange, SyncEntity } from './types';

const PUSH_KEY = 'syncPushCursor'; // max local updatedAt already pushed (client clock)
const PULL_KEY = 'syncPullCursor'; // server changefeed seq already pulled

/** Thrown when the server refused everything because this device's clock is off. */
class ClockSkewError extends Error {
	constructor(public rejected: number) {
		super(`clock skew: ${rejected} changes refused`);
		this.name = 'ClockSkewError';
	}
}

class SyncEngine {
	loggedIn = $state(false);
	syncing = $state(false);
	lastSyncedAt = $state<number | null>(null);
	/**
	 * How far this device's clock is ahead of the server, in ms, when that skew is
	 * actually blocking writes. 0 means no problem. Surfaced in Settings so the
	 * user can act on it instead of wondering why nothing syncs.
	 */
	clockSkewMs = $state(0);

	#pending = false;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#started = false;

	/**
	 * Wire mutations → debounced sync. Idempotent: only the first call installs
	 * the trigger and window listeners, so it is safe to re-enter. Listeners are
	 * installed regardless of session state because schedule() already no-ops
	 * while logged out — that way a session started later is live immediately.
	 */
	start(loggedIn: boolean) {
		if (this.#started) {
			this.setLoggedIn(loggedIn);
			return;
		}
		this.#started = true;
		this.loggedIn = loggedIn;
		localData.setSyncTrigger(() => this.schedule());
		if (browser) {
			window.addEventListener('online', () => this.schedule(0));
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible') this.schedule(0);
			});
		}
		if (loggedIn) this.schedule(0);
	}

	/**
	 * Login and logout both happen through SPA navigation (`use:enhance` +
	 * invalidateAll), so the root layout's onMount — where start() runs — never
	 * fires again. Without the layout pushing the new session state in here, a
	 * user who logged in after boot never synced at all, while the UI kept
	 * offering "Login untuk sync".
	 */
	setLoggedIn(loggedIn: boolean) {
		if (this.loggedIn === loggedIn) return;
		this.loggedIn = loggedIn;
		if (loggedIn) {
			// Only meaningful once start() has wired the trigger; before that the
			// initial schedule is start()'s job.
			if (this.#started) this.schedule(0);
			return;
		}
		// Logged out — drop any pending run so it can't fire against the new session.
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
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
		let skewed = false;
		try {
			await this.#sync();
			this.lastSyncedAt = Date.now();
			this.clockSkewMs = 0;
		} catch (e) {
			// A clock-skew failure must NOT stamp lastSyncedAt: reporting a fresh
			// sync time while the server accepted nothing is what made this
			// invisible in the first place.
			skewed = e instanceof ClockSkewError;
		} finally {
			this.syncing = false;
			if (this.#pending) {
				this.#pending = false;
				// Retrying immediately against a wrong clock only burns rate limit.
				if (!skewed) this.schedule(500);
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

		// Cap outbound batch; remainder stays above pushCursor for the next sync.
		const MAX_PUSH = 500;
		local.sort((a, b) => a.updatedAt - b.updatedAt);
		const batch = local.slice(0, MAX_PUSH);

		const res = await fetch('/api/sync', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ since: pullCursor, changes: batch })
		});
		if (res.status === 401) {
			this.loggedIn = false;
			return;
		}
		if (!res.ok) throw new Error('sync failed');

		const result = (await res.json()) as {
			changes: SyncChange[];
			cursor: number;
			acceptedMaxUpdatedAt?: number;
			acceptedCount?: number;
			rejectedFutureCount?: number;
			serverTime?: number;
		};

		// The server refuses rows whose updatedAt is more than 15 minutes ahead of
		// its own clock. That used to be invisible: a device running fast had every
		// write refused while Settings kept showing "Terakhir sync: <jam>" — the
		// account silently received nothing, for as long as the clock stayed wrong.
		//
		// Only the PUSH half is affected, so the pull below must still run. Bailing
		// out here instead threw away every remote change in this response while the
		// pull cursor had already moved past it — those changes were then never
		// redelivered, which is worse than the problem being reported.
		const rejectedFuture = Number(result.rejectedFutureCount ?? 0);
		const pushBlocked = rejectedFuture > 0 && Number(result.acceptedCount ?? 0) === 0;
		this.clockSkewMs = pushBlocked
			? // Clamp to a positive value: the refusal is judged per row stamp, so a
				// clock that has since been corrected still yields rejections while old
				// future-stamped rows remain. A zero here would hide the banner and put
				// the failure right back to being silent.
				Math.max(1, typeof result.serverTime === 'number' ? Date.now() - result.serverTime : 1)
			: 0;

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

			// One transaction for read-modify-write. Doing getItem then putItem left
			// a window in which a local write (recordHistory, addTimeSpent) could
			// commit and then be silently overwritten by this merge, using a
			// snapshot taken before it.
			let didApply = false;
			await updateItem<Record<string, unknown>>(store, Number(ch.itemKey), (current) => {
				const existing = current as (Record<string, unknown> & { updatedAt?: number }) | null;
				if (existing && ch.updatedAt <= Number(existing.updatedAt ?? 0)) return null;

				// Preserve the device-local `timeSpentMs` — never let a remote
				// change overwrite it (and a remote change shouldn't carry it
				// anyway because we strip it on push).
				let finalRow = (
					store === 'history' && existing && 'timeSpentMs' in existing
						? { ...(ch.data as Record<string, unknown>), timeSpentMs: existing.timeSpentMs }
						: ch.data
				) as Record<string, unknown>;

				if (store === 'history' && existing) {
					const ex = existing as {
						isRead?: boolean;
						lastPage?: number;
						lastPageProgress?: number;
						updatedAt?: number;
					};
					const inc = finalRow as {
						isRead?: boolean;
						lastPage?: number;
						lastPageProgress?: number;
						readClearedAt?: number;
					};
					// A deliberate "tandai belum dibaca" carries readClearedAt. If that
					// clear is newer than the row we are merging against, it wins —
					// otherwise isRead stays monotonic so a device sitting mid-chapter
					// can't undo another device's finished state.
					const explicitUnread =
						inc.isRead === false &&
						typeof inc.readClearedAt === 'number' &&
						inc.readClearedAt >= Number(ex.updatedAt ?? 0);
					// Keeping lastPage monotonic while letting lastPageProgress through
					// untouched paired the furthest page with an earlier page's fraction —
					// the same split position mergeReadPosition exists to prevent locally.
					const position = mergeReadPosition(
						{ page: Number(inc.lastPage ?? 0), progress: inc.lastPageProgress },
						{ page: Number(ex.lastPage ?? 0), progress: ex.lastPageProgress }
					);
					finalRow = {
						...finalRow,
						isRead: explicitUnread ? false : Boolean(inc.isRead || ex.isRead),
						lastPage: explicitUnread ? Number(inc.lastPage ?? 0) : position.page,
						lastPageProgress: explicitUnread ? inc.lastPageProgress : position.progress
					};
				}
				didApply = true;
				return finalRow;
			});
			if (didApply) applied = true;
			}

			// Advance push cursor only to what the server accepted (not remote
			// clocks, not unsent remainder past MAX_PUSH). Never past our own wall
			// clock either: bulk writes stamp rows slightly into the future
			// (stampBulk), and letting the cursor lead real time makes every ordinary
			// write made in that window fall below it and never get collected.
			const accepted = Number(result.acceptedMaxUpdatedAt ?? 0);
			const cappedAccepted = Math.min(accepted, Date.now());
			if (cappedAccepted > pushCursor) {
				await setMeta(PUSH_KEY, cappedAccepted);
			} else if (batch.length === 0) {
				// Nothing to push; leave cursor as-is.
			}
			await setMeta(PULL_KEY, result.cursor);
			if (applied) await localData.reload();

			// Report the blocked push only after the pull has been fully applied and
			// both cursors are persisted, so nothing is lost on the way out.
			if (pushBlocked) throw new ClockSkewError(rejectedFuture);

			// More dirty rows remain — schedule another push soon.
			if (local.length > batch.length) {
				this.schedule(300);
			}
		}
}

export const syncEngine = new SyncEngine();
