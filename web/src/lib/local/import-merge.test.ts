import { describe, it, expect } from 'vitest';
import { planHistoryImport } from './import-merge';
import type { LocalHistory, LocalReadtime } from './types';

function row(over: Partial<LocalHistory> = {}): LocalHistory {
	return {
		chapterId: 1,
		mangaId: 10,
		mangaTitle: 'M',
		thumbnailUrl: null,
		chapterName: 'C',
		lastPage: 0,
		isRead: false,
		updatedAt: 1000,
		deleted: false,
		...over
	};
}

function rt(over: Partial<LocalReadtime> = {}): LocalReadtime {
	return {
		key: '1:dev-A',
		chapterId: 1,
		deviceId: 'dev-A',
		ms: 0,
		updatedAt: 1000,
		deleted: false,
		...over
	};
}

const plan = (over: Partial<Parameters<typeof planHistoryImport>[0]> = {}) =>
	planHistoryImport({
		incoming: [],
		local: new Map(),
		localReadtime: new Map(),
		dumpReadtime: [],
		dumpDeviceId: 'dev-A',
		selfDeviceId: 'dev-B',
		...over
	});

describe('planHistoryImport — reading time', () => {
	it('keeps a guest backup lossless by re-homing the time to its source device', () => {
		// The regression this exists for: guests never sync, so their dump has NO
		// readtime rows. Dropping timeSpentMs destroyed 100% of their reading time.
		const { historyWrites, readtimeWrites } = plan({
			incoming: [row({ timeSpentMs: 144_000_000 })],
			dumpReadtime: []
		});

		expect(historyWrites[0].timeSpentMs).toBeUndefined();
		expect(readtimeWrites).toEqual([
			expect.objectContaining({ key: '1:dev-A', deviceId: 'dev-A', ms: 144_000_000 })
		]);
	});

	it('does not double-count time a readtime row already carries', () => {
		const { historyWrites, readtimeWrites } = plan({
			incoming: [row({ timeSpentMs: 600_000 })],
			dumpReadtime: [rt({ ms: 600_000 })]
		});

		expect(historyWrites[0].timeSpentMs).toBeUndefined();
		expect(readtimeWrites).toEqual([]);
	});

	it('recovers time accumulated after the last successful push', () => {
		// readtime is a lagging server echo: 10 min synced, 2 h actually read.
		const { readtimeWrites } = plan({
			incoming: [row({ timeSpentMs: 7_800_000 })],
			dumpReadtime: [rt({ ms: 600_000 })]
		});

		expect(readtimeWrites[0]).toMatchObject({ key: '1:dev-A', ms: 7_800_000 });
	});

	it('keeps the time on the row when restoring onto the same device', () => {
		const { historyWrites, readtimeWrites } = plan({
			incoming: [row({ timeSpentMs: 900_000 })],
			dumpDeviceId: 'dev-B',
			selfDeviceId: 'dev-B'
		});

		expect(historyWrites[0].timeSpentMs).toBe(900_000);
		expect(readtimeWrites).toEqual([]);
	});

	it('never adopts another device time as its own', () => {
		const { historyWrites } = plan({
			incoming: [row({ timeSpentMs: 500_000 })],
			local: new Map([['1', row({ timeSpentMs: 120_000, updatedAt: 500 })]])
		});

		expect(historyWrites[0].timeSpentMs).toBe(120_000);
	});

	it('falls back to keeping the value for a dump with no deviceId', () => {
		const { historyWrites, readtimeWrites } = plan({
			incoming: [row({ timeSpentMs: 300_000 })],
			dumpDeviceId: null
		});

		expect(historyWrites[0].timeSpentMs).toBe(300_000);
		expect(readtimeWrites).toEqual([]);
	});

	it('drops an unattributable value that readtime already covers', () => {
		const { historyWrites } = plan({
			incoming: [row({ timeSpentMs: 300_000 })],
			dumpDeviceId: null,
			dumpReadtime: [rt({ ms: 300_000 })]
		});

		expect(historyWrites[0].timeSpentMs).toBeUndefined();
	});
});

describe('planHistoryImport — row merge', () => {
	it('skips rows the local copy already supersedes', () => {
		const { historyWrites } = plan({
			incoming: [row({ updatedAt: 500 })],
			local: new Map([['1', row({ updatedAt: 900 })]])
		});
		expect(historyWrites).toEqual([]);
	});

	it('does not un-finish a chapter or rewind the furthest page', () => {
		// Device B only opened the chapter; its row is newer but behind.
		const { historyWrites } = plan({
			incoming: [row({ updatedAt: 2000, lastPage: 2, isRead: false, lastPageProgress: 0.1 })],
			local: new Map([
				['1', row({ updatedAt: 1000, lastPage: 40, isRead: true, lastPageProgress: 0.9 })]
			])
		});

		expect(historyWrites[0]).toMatchObject({
			isRead: true,
			lastPage: 40,
			lastPageProgress: 0.9
		});
	});

	it('honours a deliberate un-read that is newer than the local row', () => {
		const { historyWrites } = plan({
			incoming: [row({ updatedAt: 2000, lastPage: 0, isRead: false, readClearedAt: 2000 })],
			local: new Map([['1', row({ updatedAt: 1000, lastPage: 40, isRead: true })]])
		});

		expect(historyWrites[0]).toMatchObject({ isRead: false, lastPage: 0 });
	});

	it('preserves a local un-read stamp the dump does not carry', () => {
		const { historyWrites } = plan({
			incoming: [row({ updatedAt: 2000, isRead: true })],
			local: new Map([['1', row({ updatedAt: 1000, readClearedAt: 1500 })]])
		});

		expect(historyWrites[0].readClearedAt).toBe(1500);
	});
});
