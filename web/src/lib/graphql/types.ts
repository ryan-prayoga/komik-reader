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
};

export type FetchMangaType = 'POPULAR' | 'LATEST' | 'SEARCH';

export type DownloaderState = 'STARTED' | 'STOPPED';
export type DownloadState = 'QUEUED' | 'DOWNLOADING' | 'FINISHED' | 'ERROR';

export type DownloadItem = {
	position: number;
	progress: number;
	state: DownloadState;
	tries: number;
	chapter: {
		id: number;
		name: string;
		isDownloaded: boolean;
	};
	manga: {
		id: number;
		title: string;
		thumbnailUrl: string | null;
	};
};

export type DownloadStatus = {
	queue: DownloadItem[];
	state: DownloaderState;
};