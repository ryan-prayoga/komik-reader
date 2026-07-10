// updateChapterProgress writes are fire-and-forget (`.catch(() => {})` at the
// call sites) so a slow network or brief offline blip never blocks reading —
// but that also meant a failed write vanished forever, leaving the Suwayomi
// server silently stuck on stale progress. This queues the last-failed write
// per chapter in localStorage and replays it once network is back.

import { browser } from '$app/environment';
import { updateChapterProgress } from './api';

const STORAGE_KEY = 'komik-reader-pending-progress';

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

/** Same call as `updateChapterProgress`, but persists the last-failed attempt so it can be replayed. */
export async function queueChapterProgress(
	chapterId: number,
	lastPageRead: number,
	isRead: boolean
): Promise<void> {
	try {
		await updateChapterProgress(chapterId, lastPageRead, isRead);
		if (browser) {
			const queue = readQueue();
			if (queue[chapterId]) {
				delete queue[chapterId];
				writeQueue(queue);
			}
		}
	} catch {
		if (!browser) return;
		const queue = readQueue();
		// Latest attempt wins — only the most recent position/read-state per
		// chapter is worth resending.
		queue[chapterId] = { chapterId, lastPageRead, isRead };
		writeQueue(queue);
	}
}

let replaying = false;

/** Resend every pending write. Safe to call repeatedly (e.g. on every 'online' event). */
export async function replayQueuedProgress(): Promise<void> {
	if (!browser || replaying) return;
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
			} catch {
				// still offline / still failing — leave it queued for the next replay
			}
		}
	} finally {
		replaying = false;
	}
}
