// updateChapterProgress writes are fire-and-forget (`.catch(() => {})` at the
// call sites) so a slow network or brief offline blip never blocks reading —
// but that also meant a failed write vanished forever, leaving the Suwayomi
// server silently stuck on stale progress. This queues the last-failed write
// per chapter in localStorage and replays it once network is back.

import { browser } from '$app/environment';
import { updateChapterProgress } from './api';
import { GraphqlError } from './client';

const STORAGE_KEY = 'komik-reader-pending-progress';

/**
 * Errors a replay can never recover from — keeping these queued means retrying
 * on every app start and every 'online' event, forever, for a write that will
 * always be refused.
 *
 * Guests blocked at the proxy (401/403) were already handled. The gap was
 * GraphQL-level rejections, which arrive as HTTP 200 with an `errors` array:
 * Suwayomi routinely deletes and recreates chapter rows with new ids (see
 * local/migrate.ts), so "chapter not found" for a stale id was replayed
 * indefinitely and the queue never shrank.
 */
function isPermanentError(e: unknown): boolean {
	// Network failure / DOM abort — transient by definition.
	if (!(e instanceof GraphqlError)) return false;
	if (e.message.startsWith('Request timeout')) return false;
	// The server saw the mutation and refused it.
	if (e.errors?.length) return true;
	const status = /^HTTP (\d{3})\b/.exec(e.message);
	if (status) {
		const code = Number(status[1]);
		if (code === 408 || code === 429) return false; // explicitly retryable
		return code >= 400 && code < 500;
	}
	return false;
}

// Backstop so a long offline stretch can't grow the queue without bound. Oldest
// entries lose; the newest positions are the ones worth replaying.
const MAX_QUEUE_ENTRIES = 500;

type PendingEntry = { chapterId: number; lastPageRead: number; isRead: boolean };

function readQueue(): Record<string, PendingEntry> {
	if (!browser) return {};
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
	} catch {
		return {};
	}
}

	function writeQueue(queue: Record<string, PendingEntry>) {
		if (!browser) return;
		const keys = Object.keys(queue);
		if (keys.length > MAX_QUEUE_ENTRIES) {
			for (const k of keys.slice(0, keys.length - MAX_QUEUE_ENTRIES)) delete queue[k];
		}
		try {
			// Drop the key entirely when nothing is pending, so an empty queue leaves
			// no trace in localStorage.
			if (Object.keys(queue).length === 0) localStorage.removeItem(STORAGE_KEY);
			else localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
		} catch {
			// Quota exceeded / private mode — losing a queued position is bad but
			// throwing here would take down the caller's read path with it.
		}
	}

	let chain: Promise<void> = Promise.resolve();
	function serialize<T>(fn: () => Promise<T>): Promise<T> {
		const run = chain.then(fn, fn);
		chain = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}

	function mergeEntry(
		prev: PendingEntry | undefined,
		next: PendingEntry
	): PendingEntry {
		if (!prev) return next;
		return {
			chapterId: next.chapterId,
			lastPageRead: Math.max(prev.lastPageRead, next.lastPageRead),
			isRead: Boolean(prev.isRead || next.isRead)
		};
	}

	/** Same call as `updateChapterProgress`, but persists the last-failed attempt so it can be replayed. */
	export async function queueChapterProgress(
		chapterId: number,
		lastPageRead: number,
		isRead: boolean,
		opts?: { keepalive?: boolean }
	): Promise<void> {
		return serialize(async () => {
			// Write-ahead: record the intent BEFORE the request goes out. Enqueuing
			// only in the catch lost the write completely when the page died
			// mid-flight — the pagehide flush starts the fetch, the document goes
			// away, the promise never settles, and the catch never runs. That is
			// exactly the moment whose position matters most.
			if (browser) {
				const queue = readQueue();
				queue[chapterId] = mergeEntry(queue[chapterId], { chapterId, lastPageRead, isRead });
				writeQueue(queue);
			}
			try {
				await updateChapterProgress(chapterId, lastPageRead, isRead, opts);
				if (browser) {
					// serialize() guarantees no other writer touched this entry while the
					// request was in flight, so clearing it here cannot drop a newer one.
					const queue = readQueue();
					if (queue[chapterId]) {
						delete queue[chapterId];
						writeQueue(queue);
					}
				}
			} catch (e) {
				if (browser && isPermanentError(e)) {
					const queue = readQueue();
					delete queue[chapterId];
					writeQueue(queue);
				}
				// Otherwise leave it queued — replayQueuedProgress retries it.
			}
		});
	}

	let replaying = false;

	/** Resend every pending write. Safe to call repeatedly (e.g. on every 'online' event). */
	export async function replayQueuedProgress(): Promise<void> {
		if (!browser || replaying) return;
		return serialize(async () => {
			if (replaying) return;
			const queue = readQueue();
			const entries = Object.values(queue);
			if (!entries.length) return;
			replaying = true;
			try {
				for (const entry of entries) {
					try {
						await updateChapterProgress(entry.chapterId, entry.lastPageRead, entry.isRead);
						const current = readQueue();
						delete current[entry.chapterId];
						writeQueue(current);
					} catch (e) {
						if (isPermanentError(e)) {
							const current = readQueue();
							delete current[entry.chapterId];
							writeQueue(current);
						}
					}
				}
			} finally {
				replaying = false;
			}
		});
	}
