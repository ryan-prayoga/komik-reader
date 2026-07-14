import { describe, expect, it } from 'vitest';
import {
	buildContinueReading,
	continueProgressPct,
	isFinishedStale,
	isLatestChapterRead,
	resolveContinueStatus
} from './continue-reading';
import type { LocalHistory } from './local/types';

function row(overrides: Partial<LocalHistory> & { chapterId: number; mangaId: number }): LocalHistory {
	return {
		mangaTitle: 'Manga',
		thumbnailUrl: null,
		chapterName: 'Chapter',
		lastPage: 0,
		isRead: false,
		updatedAt: 0,
		...overrides
	};
}

describe('buildContinueReading', () => {
	it('keeps a manga whose latest chapter was just finished, instead of dropping it', () => {
		const history = [row({ chapterId: 5, mangaId: 1, isRead: true, updatedAt: 100 })];
		const out = buildContinueReading(history, 6);
		expect(out).toHaveLength(1);
		expect(out[0].isRead).toBe(true);
		expect(out[0].id).toBe(5);
	});

	it('dedupes per manga to the most recently touched row', () => {
		const history = [
			row({ chapterId: 2, mangaId: 1, updatedAt: 200, chapterName: 'Ch 2' }),
			row({ chapterId: 1, mangaId: 1, updatedAt: 100, chapterName: 'Ch 1' })
		];
		const out = buildContinueReading(history, 6);
		expect(out).toHaveLength(1);
		expect(out[0].id).toBe(2);
	});

	it('respects the limit', () => {
		const history = [1, 2, 3].map((i) => row({ chapterId: i, mangaId: i, updatedAt: i }));
		expect(buildContinueReading(history, 2)).toHaveLength(2);
	});
});

	describe('continueProgressPct', () => {
		const base = {
			id: 1,
			name: 'c',
			mangaId: 1,
			lastReadAt: '',
			manga: { id: 1, title: '', thumbnailUrl: null as string | null }
		};

		it('is null once the chapter is finished', () => {
			const pct = continueProgressPct({
				...base,
				lastPageRead: 5,
				totalPages: 10,
				isRead: true
			});
			expect(pct).toBeNull();
		});

		it('is null before any page has been scrolled past (legacy, no lastPageProgress)', () => {
			const pct = continueProgressPct({
				...base,
				lastPageRead: 0,
				totalPages: 10,
				isRead: false
			});
			expect(pct).toBeNull();
		});

		it('computes a mid-chapter percentage via page-index formula when lastPageProgress is absent', () => {
			// (4 + 1) / 20 * 100 = 25
			const pct = continueProgressPct({
				...base,
				lastPageRead: 4,
				totalPages: 20,
				isRead: false
			});
			expect(pct).toBe(25);
		});

		it('uses lastPageProgress fractional formula when defined', () => {
			// (4 + 0.5) / 20 * 100 = 22.5 → 23
			const pct = continueProgressPct({
				...base,
				lastPageRead: 4,
				lastPageProgress: 0.5,
				totalPages: 20,
				isRead: false
			});
			expect(pct).toBe(23);
		});

		it('clamps lastPageProgress branch to 1..99', () => {
			// tiny progress on first page → would be 0 without clamp
			expect(
				continueProgressPct({
					...base,
					lastPageRead: 0,
					lastPageProgress: 0,
					totalPages: 100,
					isRead: false
				})
			).toBe(1);

			// almost finished last-but-one page → would be 100 without clamp
			// lastPageRead=9, total=10 → lastPageRead >= total-1 would null; use mid
			// (9 + 0.99) / 20 * 100 = 49.95 → 50, within range
			expect(
				continueProgressPct({
					...base,
					lastPageRead: 0,
					lastPageProgress: 0.001,
					totalPages: 1000,
					isRead: false
				})
			).toBe(1);

			// high progress: (0 + 0.999) / 1 would be 100 but totalPages<=1 → null;
			// (18 + 0.9) / 20 * 100 = 94.5 → 95
			expect(
				continueProgressPct({
					...base,
					lastPageRead: 18,
					lastPageProgress: 0.9,
					totalPages: 20,
					isRead: false
				})
			).toBe(95);
		});

		it('is null when on the last page index even if lastPageProgress is set', () => {
			const pct = continueProgressPct({
				...base,
				lastPageRead: 9,
				lastPageProgress: 0.3,
				totalPages: 10,
				isRead: false
			});
			expect(pct).toBeNull();
		});

		it('buildContinueReading copies lastPageProgress from LocalHistory', () => {
			const history = [
				row({
					chapterId: 5,
					mangaId: 1,
					lastPage: 3,
					lastPageProgress: 0.4,
					totalPages: 20,
					updatedAt: 100
				})
			];
			const out = buildContinueReading(history, 6);
			expect(out[0].lastPageProgress).toBe(0.4);
			expect(continueProgressPct(out[0])).toBe(17); // (3+0.4)/20*100 = 17
		});
	});

describe('isLatestChapterRead', () => {
	it('matches by chapter id', () => {
		expect(
			isLatestChapterRead(
				[
					{ chapterId: 10, chapterNumber: 5, isRead: true },
					{ chapterId: 11, chapterNumber: 6, isRead: true }
				],
				{ latestChapterId: 11, latestChapterNumber: 6 }
			)
		).toBe(true);
	});

	it('is false when latest id exists but is unread', () => {
		expect(
			isLatestChapterRead([{ chapterId: 11, chapterNumber: 6, isRead: false }], {
				latestChapterId: 11,
				latestChapterNumber: 6
			})
		).toBe(false);
	});

	it('falls back to chapter number when id is missing from history', () => {
		expect(
			isLatestChapterRead([{ chapterId: 99, chapterNumber: 10, isRead: true }], {
				latestChapterId: 50,
				latestChapterNumber: 10
			})
		).toBe(true);
	});
});

describe('resolveContinueStatus', () => {
	const base = { id: 1, name: 'Chapter 10', mangaId: 7, chapterNumber: 10 };

	it('LANJUT when mid-chapter', () => {
		const s = resolveContinueStatus({
			lastChapter: { ...base, isRead: false },
			historyForManga: [{ chapterId: 1, chapterNumber: 10, isRead: false }]
		});
		expect(s.kind).toBe('lanjut');
		expect(s.label).toBe('Lanjut');
		expect(s.subtitle).toBe('Chapter 10');
		expect(s.href).toBe('/read/1');
	});

	it('does not claim SELESAI without update meta (only finished last-touched)', () => {
		const s = resolveContinueStatus({
			lastChapter: { ...base, isRead: true },
			historyForManga: [{ chapterId: 1, chapterNumber: 10, isRead: true }]
		});
		expect(s.kind).toBe('lanjut');
		expect(s.subtitle).toBe('Lanjut ke chapter berikutnya');
		expect(s.href).toBe('/manga/7');
	});

	it('BARU when a newer chapter exists after finishing last-touched', () => {
		const s = resolveContinueStatus({
			lastChapter: { ...base, isRead: true },
			historyForManga: [{ chapterId: 1, chapterNumber: 10, isRead: true }],
			updateMeta: {
				latestChapterId: 2,
				latestChapterNumber: 11,
				latestChapterName: 'Chapter 11',
				mangaStatus: 'ONGOING',
				hasUpdate: true
			}
		});
		expect(s.kind).toBe('baru');
		expect(s.label).toBe('Baru');
		expect(s.subtitle).toContain('Chapter 11');
		expect(s.href).toBe('/read/2');
	});

	it('SELESAI when all known chapters read and series is ongoing (with status hint)', () => {
		const s = resolveContinueStatus({
			lastChapter: { ...base, isRead: true },
			historyForManga: [{ chapterId: 1, chapterNumber: 10, isRead: true }],
			updateMeta: {
				latestChapterId: 1,
				latestChapterNumber: 10,
				latestChapterName: 'Chapter 10',
				mangaStatus: 'ONGOING'
			}
		});
		expect(s.kind).toBe('selesai');
		expect(s.label).toBe('Selesai');
		expect(s.subtitle).toBe('Ongoing · menunggu chapter baru');
	});

	it('TAMAT when all known chapters read and series is completed', () => {
		const s = resolveContinueStatus({
			lastChapter: { ...base, isRead: true },
			historyForManga: [{ chapterId: 1, chapterNumber: 10, isRead: true }],
			updateMeta: {
				latestChapterId: 1,
				latestChapterNumber: 10,
				latestChapterName: 'Chapter 10',
				mangaStatus: 'COMPLETED'
			}
		});
		expect(s.kind).toBe('tamat');
		expect(s.label).toBe('Tamat');
		expect(s.showCheck).toBe(true);
		expect(s.subtitle).toBe('Tamat · semua chapter dibaca');
	});

	it('SELESAI when status unknown but fully caught up (safer than TAMAT)', () => {
		const s = resolveContinueStatus({
			lastChapter: { ...base, isRead: true },
			historyForManga: [{ chapterId: 1, chapterNumber: 10, isRead: true }],
			updateMeta: {
				latestChapterId: 1,
				latestChapterNumber: 10,
				latestChapterName: 'Chapter 10',
				mangaStatus: null
			}
		});
		expect(s.kind).toBe('selesai');
		expect(s.label).toBe('Selesai');
		expect(s.subtitle).toBe('Menunggu chapter baru');
	});

	it('LANJUT next when finished mid-series without hasUpdate flag', () => {
		const s = resolveContinueStatus({
			lastChapter: { ...base, isRead: true },
			historyForManga: [{ chapterId: 1, chapterNumber: 10, isRead: true }],
			updateMeta: {
				latestChapterId: 2,
				latestChapterNumber: 11,
				latestChapterName: 'Chapter 11',
				mangaStatus: 'ONGOING',
				hasUpdate: false
			}
		});
		// behindLatest (10 < 11) still surfaces as Baru so user sees the tip chapter
		expect(s.kind).toBe('baru');
		expect(s.subtitle).toContain('Chapter 11');
	});
});

describe('isFinishedStale', () => {
	const DAY = 24 * 60 * 60 * 1000;

	it('never hides an active (lanjut/baru) card regardless of age', () => {
		expect(isFinishedStale('lanjut', 0, 30 * DAY)).toBe(false);
		expect(isFinishedStale('baru', 0, 30 * DAY)).toBe(false);
	});

	it('keeps a finished card visible within the 7-day grace window', () => {
		expect(isFinishedStale('selesai', 0, 6 * DAY)).toBe(false);
		expect(isFinishedStale('tamat', 0, 7 * DAY)).toBe(false);
	});

	it('hides a finished card once it is older than 7 days', () => {
		expect(isFinishedStale('selesai', 0, 8 * DAY)).toBe(true);
		expect(isFinishedStale('tamat', 0, 8 * DAY)).toBe(true);
	});
});
