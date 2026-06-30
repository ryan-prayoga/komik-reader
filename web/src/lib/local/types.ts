// Local-first records. Every row carries `updatedAt` (epoch ms) and a `deleted`
// tombstone so the optional account-sync engine can merge last-write-wins and
// propagate deletions across devices.

export type LocalHistory = {
	chapterId: number;
	mangaId: number;
	mangaTitle: string;
	thumbnailUrl: string | null;
	chapterName: string;
	lastPage: number;
	isRead: boolean;
	updatedAt: number;
	// Added later; optional for backward-compat with rows written before this.
	sourceId?: string | null;
	chapterNumber?: number;
	totalPages?: number;
	deleted?: boolean;
};

export type LocalLibrary = {
	mangaId: number;
	title: string;
	thumbnailUrl: string | null;
	sourceId: string | null;
	categoryIds: number[];
	addedAt: number;
	updatedAt: number;
	deleted?: boolean;
};

export type LocalCategory = {
	id: number;
	name: string;
	order: number;
	createdAt: number;
	updatedAt: number;
	deleted?: boolean;
};

export type SyncEntity = 'history' | 'library' | 'categories';

/** Wire shape exchanged with the server sync endpoint. */
export type SyncChange = {
	entity: SyncEntity;
	itemKey: string;
	data: unknown;
	updatedAt: number;
	deleted: boolean;
};
