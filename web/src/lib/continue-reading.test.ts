import { describe, expect, it } from 'vitest';
import { buildContinueReading, continueProgressPct } from './continue-reading';
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
	it('is null once the chapter is finished', () => {
		const pct = continueProgressPct({
			id: 1,
			name: 'c',
			mangaId: 1,
			lastPageRead: 5,
			totalPages: 10,
			isRead: true,
			lastReadAt: '',
			manga: { id: 1, title: '', thumbnailUrl: null }
		});
		expect(pct).toBeNull();
	});

	it('is null before any page has been scrolled past', () => {
		const pct = continueProgressPct({
			id: 1,
			name: 'c',
			mangaId: 1,
			lastPageRead: 0,
			totalPages: 10,
			isRead: false,
			lastReadAt: '',
			manga: { id: 1, title: '', thumbnailUrl: null }
		});
		expect(pct).toBeNull();
	});

	it('computes a mid-chapter percentage', () => {
		const pct = continueProgressPct({
			id: 1,
			name: 'c',
			mangaId: 1,
			lastPageRead: 4,
			totalPages: 20,
			isRead: false,
			lastReadAt: '',
			manga: { id: 1, title: '', thumbnailUrl: null }
		});
		expect(pct).toBe(25);
	});
});
