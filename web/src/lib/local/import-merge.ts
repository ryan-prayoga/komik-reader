import type { LocalHistory, LocalReadtime } from './types';
import { mergeReadPosition } from './history-merge';

/**
 * Plan a history import.
 *
 * Two things make this more than a last-write-wins overwrite.
 *
 * 1. `timeSpentMs` on a history row is the OWNING device's reading time; the
 *    sync engine mirrors it into a `${chapterId}:${deviceId}` readtime row, and
 *    the account total is "my timeSpentMs + every OTHER device's readtime". So
 *    adopting a dump's value verbatim makes this device republish someone
 *    else's minutes under its own id and the account counts them twice — but
 *    simply dropping the field destroys the time outright whenever no readtime
 *    row covers it, which is every guest backup (guests never sync, so their
 *    readtime store is empty) and any time accumulated since the last
 *    successful push. Preserve it as the SOURCE device's readtime row instead:
 *    counted once, under the device that actually earned it.
 *
 * 2. A dump row is not automatically the truth. Importing must not undo a
 *    finished chapter or rewind the furthest page, the same invariants the sync
 *    pull merge protects — a plain overwrite regressed `isRead`, `lastPage` and
 *    a deliberate `readClearedAt`.
 */
export type ImportPlan = {
	historyWrites: LocalHistory[];
	readtimeWrites: LocalReadtime[];
};

export function planHistoryImport(input: {
	incoming: readonly LocalHistory[];
	local: ReadonlyMap<string, LocalHistory>;
	localReadtime: ReadonlyMap<string, LocalReadtime>;
	dumpReadtime: readonly LocalReadtime[];
	/** Device that produced the dump; null for dumps written before this was recorded. */
	dumpDeviceId: string | null;
	selfDeviceId: string;
}): ImportPlan {
	const { incoming, local, localReadtime, dumpReadtime, dumpDeviceId, selfDeviceId } = input;
	const sameDevice = Boolean(dumpDeviceId) && dumpDeviceId === selfDeviceId;

	const historyWrites: LocalHistory[] = [];
	const readtimeWrites: LocalReadtime[] = [];

	for (const row of incoming) {
		const key = String(row.chapterId);
		const current = local.get(key);
		// Last-write-wins on the row as a whole, same as the sync engine.
		if (current && row.updatedAt <= current.updatedAt) continue;

		const dumpOwnMs = row.timeSpentMs ?? 0;
		const localOwnMs = current?.timeSpentMs;
		let timeSpentMs: number | undefined;

		if (sameDevice) {
			// Restoring onto the device that wrote the dump: the time really is
			// ours, and the mirror targets the same readtime key, so nothing can
			// double. Keep whichever copy is further along.
			timeSpentMs = Math.max(dumpOwnMs, localOwnMs ?? 0) || undefined;
		} else if (dumpOwnMs > 0 && dumpDeviceId) {
			timeSpentMs = localOwnMs;
			// Hand the source device's time to its own readtime row, but only when
			// it exceeds what is already recorded there — the dump's readtime is a
			// server echo and lags anything read since the last push.
			const rtKey = `${row.chapterId}:${dumpDeviceId}`;
			const known = Math.max(
				localReadtime.get(rtKey)?.ms ?? 0,
				dumpReadtime.find((r) => r.key === rtKey)?.ms ?? 0
			);
			if (dumpOwnMs > known) {
				readtimeWrites.push({
					key: rtKey,
					chapterId: row.chapterId,
					deviceId: dumpDeviceId,
					ms: dumpOwnMs,
					updatedAt: row.updatedAt,
					deleted: false
				});
			}
		} else if (dumpOwnMs > 0) {
			// Pre-deviceId dump: we cannot attribute the time to anyone. Keep it on
			// the row unless a readtime row already accounts for that chapter,
			// which would double it.
			const covered = dumpReadtime.some((r) => r.chapterId === row.chapterId && (r.ms ?? 0) > 0);
			timeSpentMs = localOwnMs ?? (covered ? undefined : dumpOwnMs);
		} else {
			timeSpentMs = localOwnMs;
		}

		if (!current) {
			historyWrites.push({ ...row, timeSpentMs });
			continue;
		}

		// Merge rather than overwrite: a dump from a device that is behind on this
		// chapter must not un-finish it or rewind the furthest page.
		const position = mergeReadPosition(
			{ page: row.lastPage, progress: row.lastPageProgress },
			{ page: current.lastPage, progress: current.lastPageProgress }
		);
		const explicitUnread =
			row.isRead === false &&
			typeof row.readClearedAt === 'number' &&
			row.readClearedAt >= current.updatedAt;

		historyWrites.push({
			...row,
			timeSpentMs,
			isRead: explicitUnread ? false : Boolean(row.isRead || current.isRead),
			lastPage: explicitUnread ? row.lastPage : position.page,
			lastPageProgress: explicitUnread ? row.lastPageProgress : position.progress,
			// A local un-read stamp outlives an import that does not carry one.
			readClearedAt: row.readClearedAt ?? current.readClearedAt,
			totalPages: row.totalPages ?? current.totalPages
		});
	}

	return { historyWrites, readtimeWrites };
}
