import type { LibraryManga } from '$lib/graphql/types';

export function continueReadingUrl(manga: LibraryManga): string {
	if (manga.lastReadChapter) return `/read/${manga.lastReadChapter.id}`;
	if (manga.firstUnreadChapter) return `/read/${manga.firstUnreadChapter.id}`;
	return `/manga/${manga.id}`;
}

export function continueReadingLabel(manga: LibraryManga): string {
	if (manga.lastReadChapter) return manga.lastReadChapter.name;
	if (manga.firstUnreadChapter) return manga.firstUnreadChapter.name;
	return 'Mulai baca';
}