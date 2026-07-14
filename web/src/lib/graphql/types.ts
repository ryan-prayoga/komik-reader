export type Extension = {
	pkgName: string;
	name: string;
	lang: string;
	versionName: string;
	versionCode: number;
	isInstalled: boolean;
	hasUpdate: boolean;
	isNsfw: boolean;
	isObsolete: boolean;
	iconUrl: string;
	apkName: string;
	repo: string | null;
};

export type Source = {
	id: string;
	name: string;
	lang: string;
	isNsfw: boolean;
	iconUrl: string;
	extension: {
		pkgName: string;
		repo: string | null;
	};
};

export type Manga = {
	id: number;
	title: string;
	thumbnailUrl: string | null;
	inLibrary: boolean;
	sourceId: string;
};

export type LibraryChapterRef = {
	id: number;
	name: string;
	lastPageRead?: number;
};

export type LibraryManga = Manga & {
	unreadCount: number;
	lastReadChapter: LibraryChapterRef | null;
	firstUnreadChapter: LibraryChapterRef | null;
	latestUploadedChapter: LibraryChapterRef | null;
};

export type RecentChapter = {
	id: number;
	name: string;
	mangaId: number;
	lastPageRead: number;
	totalPages?: number;
	/** Scroll fraction within lastPageRead (0–1, webtoon); from local history only. */
	lastPageProgress?: number;
	/** Set when built from local history; absent for server-sourced rows (always unread there). */
	isRead?: boolean;
	lastReadAt: string;
	manga: {
		id: number;
		title: string;
		thumbnailUrl: string | null;
	};
};

export type MangaDetail = Manga & {
	author: string | null;
	artist: string | null;
	description: string | null;
	genre: string[];
	status: string;
};

export type Chapter = {
	id: number;
	name: string;
	chapterNumber: number;
	isRead: boolean;
	isDownloaded: boolean;
	lastPageRead: number;
	uploadDate: string;
	sourceOrder: number;
	/** Total pages known by the server; -1/0 until the chapter's pages were ever fetched. */
	pageCount?: number;
};

export type FetchMangaType = 'POPULAR' | 'LATEST' | 'SEARCH';

export type Category = {
	id: number;
	name: string;
	order: number;
	default: boolean;
	mangaCount?: number;
};

export type AboutServer = {
	name: string;
	version: string;
	revision: string;
	buildType: string;
};

export type ServerSettings = {
	autoDownloadNewChapters: boolean;
	autoDownloadNewChaptersLimit: number;
	updateMangas: boolean;
	globalUpdateInterval: number;
	downloadsPath: string;
	extensionRepos: string[];
};

export type BrowseManga = Manga & {
	status: string;
	genre: string[];
	latestUploadedChapter: {
		name: string;
		chapterNumber: number;
		uploadDate: string;
	} | null;
};

export type HistoryChapter = {
	id: number;
	name: string;
	lastReadAt: string;
	lastPageRead: number;
	isRead: boolean;
	mangaId: number;
	manga: {
		id: number;
		title: string;
		thumbnailUrl: string | null;
	};
};

export type TriState = 'IGNORED' | 'INCLUDE' | 'EXCLUDE';

export type CheckBoxFilter = { __typename: 'CheckBoxFilter'; name: string; state: boolean };
export type HeaderFilter = { __typename: 'HeaderFilter'; name: string };
export type SelectFilter = { __typename: 'SelectFilter'; name: string; values: string[]; state: number };
export type SeparatorFilter = { __typename: 'SeparatorFilter'; name: string };
export type SortFilter = {
	__typename: 'SortFilter';
	name: string;
	values: string[];
	state: { index: number; ascending: boolean } | null;
};
export type TextFilter = { __typename: 'TextFilter'; name: string; state: string };
export type TriStateFilter = { __typename: 'TriStateFilter'; name: string; state: TriState };
export type GroupFilter = {
	__typename: 'GroupFilter';
	name: string;
	filters: (CheckBoxFilter | TriStateFilter | TextFilter | SelectFilter)[];
};

export type SourceFilter =
	| CheckBoxFilter
	| HeaderFilter
	| SelectFilter
	| SeparatorFilter
	| SortFilter
	| TextFilter
	| TriStateFilter
	| GroupFilter;

export type FilterChangeInput = {
	position: number;
	checkBoxState?: boolean;
	selectState?: number;
	triState?: TriState;
	sortState?: { ascending: boolean; index: number };
	textState?: string;
	groupState?: FilterChangeInput[];
};