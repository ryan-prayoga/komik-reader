// updateChapterProgress writes are fire-and-forget (`.catch(() => {})` at the
// call sites) so a slow network or brief offline blip never blocks reading —
// but that also meant a failed write vanished forever, leaving the Suwayomi
// server silently stuck on stale progress. This queues the last-failed write
// per chapter in localStorage and replays it once network is back.

import { browser } from '$app/environment';
import { updateChapterProgress } from './api';
import { GraphqlError } from './client';

const STORAGE_KEY = 'komik-reader-pending-progress';

// Guests are blocked from progress writes at the proxy (401) — that's a
// permanent condition, not a blip. Queueing those would grow the queue
// unboundedly and, worse, replay stale positions long after the state moved on.
function isAuthError(e: unknown): boolean {
	return e instanceof GraphqlError && /^HTTP 40[13]\b/.test(e.message);
}

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
		localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
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
		isRead: boolean
	): Promise<void> {
		return serialize(async () => {
			try {
				await updateChapterProgress(chapterId, lastPageRead, isRead);
				if (browser) {
					const queue = readQueue();
					if (queue[chapterId]) {
						delete queue[chapterId];
						writeQueue(queue);
					}
				}
			} catch (e) {
				if (!browser || isAuthError(e)) return;
				const queue = readQueue();
				queue[chapterId] = mergeEntry(queue[chapterId], {
					chapterId,
					lastPageRead,
					isRead
				});
				writeQueue(queue);
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
						if (isAuthError(e)) {
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
