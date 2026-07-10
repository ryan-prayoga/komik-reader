import { describe, expect, it } from 'vitest';
import { planChapterIdMigration, type LiveChapter } from './migrate';
import type { LocalHistory } from './types';

const NOW = 1_800_000_000_000;

function row(overrides: Partial<LocalHistory> & { chapterId: number }): LocalHistory {
	return {
		mangaId: 1,
		mangaTitle: 'Manga',
		thumbnailUrl: null,
		chapterName: 'Chapter',
		lastPage: 0,
		isRead: false,
		updatedAt: NOW - 1000,
		...overrides
	};
}

function ch(id: number, chapterNumber: number, name = `Chapter ${chapterNumber}`): LiveChapter {
	return { id, chapterNumber, name };
}

describe('planChapterIdMigration', () => {
	it('re-keys an orphaned read row onto the live chapter with the same number', () => {
		const history = [
			row({ chapterId: 100, chapterNumber: 230, isRead: true, lastPage: 18, timeSpentMs: 5000 })
		];
		const live = [ch(900, 230, 'Chapter 230 (re-up)')];

		const plan = planChapterIdMigration(1, live, history, NOW);

		expect(plan.migrated).toHaveLength(1);
		const m = plan.migrated[0];
		expect(m.chapterId).toBe(900);
		expect(m.isRead).toBe(true);
		expect(m.lastPage).toBe(18);
		expect(m.timeSpentMs).toBe(5000);
		expect(m.chapterName).toBe('Chapter 230 (re-up)');
		expect(m.updatedAt).toBe(NOW);
		// New row + tombstone for the old key, so sync converges other devices.
		expect(plan.writes).toHaveLength(2);
		const tombstone = plan.writes.find((w) => w.chapterId === 100);
		expect(tombstone?.deleted).toBe(true);
		expect(tombstone?.updatedAt).toBe(NOW);
		expect(plan.remap.get(100)).toBe(m);
	});

	it('leaves rows whose chapterId still exists untouched', () => {
		const history = [row({ chapterId: 100, chapterNumber: 230, isRead: true })];
		const plan = planChapterIdMigration(1, [ch(100, 230)], history, NOW);
		expect(plan.migrated).toHaveLength(0);
		expect(plan.writes).toHaveLength(0);
	});

	it('ignores rows from other manga', () => {
		const history = [row({ chapterId: 100, mangaId: 2, chapterNumber: 230, isRead: true })];
		const plan = planChapterIdMigration(1, [ch(900, 230)], history, NOW);
		expect(plan.migrated).toHaveLength(0);
	});

	it('skips ambiguous chapter numbers (multiple live candidates)', () => {
		const history = [row({ chapterId: 100, chapterNumber: 230, isRead: true })];
		const plan = planChapterIdMigration(1, [ch(900, 230), ch(901, 230)], history, NOW);
		expect(plan.migrated).toHaveLength(0);
	});

	it('skips rows without a usable chapterNumber (oneshots, legacy rows)', () => {
		const history = [
			row({ chapterId: 100, chapterNumber: 0, isRead: true }),
			row({ chapterId: 101, isRead: true }) // chapterNumber undefined
		];
		const plan = planChapterIdMigration(1, [ch(900, 0), ch(901, 1)], history, NOW);
		expect(plan.migrated).toHaveLength(0);
	});

	it('never migrates onto a chapter id already tracked by another row', () => {
		const history = [
			row({ chapterId: 900, chapterNumber: 230, isRead: false, updatedAt: NOW - 10 }),
			row({ chapterId: 100, chapterNumber: 230, isRead: true, updatedAt: NOW - 20 })
		];
		const plan = planChapterIdMigration(1, [ch(900, 230)], history, NOW);
		expect(plan.migrated).toHaveLength(0);
	});

	it('lets the most recently touched orphan win when two claim one live chapter', () => {
		// history is sorted updatedAt desc, matching localData.history's invariant
		const history = [
			row({ chapterId: 101, chapterNumber: 230, isRead: true, updatedAt: NOW - 10 }),
			row({ chapterId: 100, chapterNumber: 230, isRead: false, updatedAt: NOW - 20 })
		];
		const plan = planChapterIdMigration(1, [ch(900, 230)], history, NOW);
		expect(plan.migrated).toHaveLength(1);
		expect(plan.remap.has(101)).toBe(true);
		expect(plan.remap.has(100)).toBe(false);
	});

	it('ignores tombstoned rows entirely', () => {
		const history = [row({ chapterId: 100, chapterNumber: 230, isRead: true, deleted: true })];
		const plan = planChapterIdMigration(1, [ch(900, 230)], history, NOW);
		expect(plan.migrated).toHaveLength(0);
	});

	it('handles decimal chapter numbers', () => {
		const history = [row({ chapterId: 100, chapterNumber: 10.5, isRead: true })];
		const plan = planChapterIdMigration(1, [ch(900, 10.5)], history, NOW);
		expect(plan.migrated).toHaveLength(1);
		expect(plan.migrated[0].chapterId).toBe(900);
	});

	it('returns an empty plan for an empty live chapter list', () => {
		const history = [row({ chapterId: 100, chapterNumber: 230, isRead: true })];
		const plan = planChapterIdMigration(1, [], history, NOW);
		expect(plan.migrated).toHaveLength(0);
	});

	it('migrates several orphans in one pass', () => {
		const history = [
			row({ chapterId: 100, chapterNumber: 225, isRead: true }),
			row({ chapterId: 101, chapterNumber: 227, isRead: true, lastPage: 12 }),
			row({ chapterId: 102, chapterNumber: 228, isRead: false, lastPage: 3 })
		];
		const live = [ch(900, 225), ch(901, 227), ch(902, 228), ch(903, 229)];
		const plan = planChapterIdMigration(1, live, history, NOW);
		expect(plan.migrated).toHaveLength(3);
		expect(plan.writes).toHaveLength(6);
		expect(plan.remap.get(101)?.chapterId).toBe(901);
		expect(plan.remap.get(102)?.isRead).toBe(false);
		expect(plan.remap.get(102)?.lastPage).toBe(3);
	});
});
