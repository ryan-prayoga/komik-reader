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
	/**
	 * Wall-clock ms spent actively reading this chapter on THIS device.
	 * The raw field stays device-local (LWW would clobber another device's
	 * accumulated time). Instead the sync engine mirrors it into a per-device
	 * `readtime` row keyed by `${chapterId}:${deviceId}`, so stats can sum every
	 * device's contribution without any device overwriting another's total.
	 */
	timeSpentMs?: number;
};

/**
 * Per-device reading time, synced to the account so the Stats page can add up
 * time from every device. Keyed by `${chapterId}:${deviceId}`; each device only
 * ever writes its own key, whose `ms` is monotonically increasing — so plain
 * last-write-wins by `updatedAt` never loses time.
 */
export type LocalReadtime = {
	key: string; // `${chapterId}:${deviceId}`
	chapterId: number;
	deviceId: string;
	ms: number;
	updatedAt: number;
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

/**
 * Device-local snapshot of the newest chapter known for a library manga.
 * `hasUpdate` is derived: latest is newer than what the user last "saw"
 * (opened detail / marked seen). Not synced across devices.
 */
export type LocalUpdateMeta = {
	mangaId: number;
	title: string;
	thumbnailUrl: string | null;
	sourceId: string | null;
	latestChapterId: number | null;
	latestChapterNumber: number;
	latestChapterName: string;
	/** Baseline when user last acknowledged the chapter list. */
	seenChapterId: number | null;
	seenChapterNumber: number;
	lastCheckedAt: number;
	updatedAt: number;
};

export type SyncEntity = 'history' | 'library' | 'categories' | 'readtime';

/** Wire shape exchanged with the server sync endpoint. */
export type SyncChange = {
	entity: SyncEntity;
	itemKey: string;
	data: unknown;
	updatedAt: number;
	deleted: boolean;
};
