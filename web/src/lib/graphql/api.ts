import { gql } from './client';
import type {
	AboutServer,
	BrowseManga,
	Category,
	Chapter,
	Extension,
	FetchMangaType,
	FilterChangeInput,
	HistoryChapter,
	LibraryManga,
	Manga,
	MangaDetail,
	RecentChapter,
	ServerSettings,
	Source,
	SourceFilter
} from './types';

const EXTENSION_FIELDS = `
	pkgName name lang versionName versionCode
	isInstalled hasUpdate isNsfw isObsolete iconUrl apkName repo
`;

const SOURCE_FIELDS = `
	id name lang isNsfw iconUrl
	extension { pkgName repo }
`;

const MANGA_FIELDS = `id title thumbnailUrl inLibrary sourceId`;

export async function fetchExtensionsCatalog(): Promise<Extension[]> {
	const data = await gql<{
		fetchExtensions: { extensions: Extension[] };
	}>(
		`mutation {
			fetchExtensions(input: {}) {
				extensions { ${EXTENSION_FIELDS} }
			}
		}`
	);
	return data.fetchExtensions.extensions;
}

export async function getExtensions(isNsfw: boolean | null = false): Promise<Extension[]> {
	const data = await gql<{
		extensions: { nodes: Extension[] };
	}>(
		`query($isNsfw: Boolean) {
			extensions(condition: { isNsfw: $isNsfw }) {
				nodes { ${EXTENSION_FIELDS} }
			}
		}`,
		{ isNsfw }
	);
	return data.extensions.nodes;
}

export async function updateExtension(
	pkgName: string,
	patch: { install?: boolean; uninstall?: boolean; update?: boolean }
): Promise<Extension | null> {
	const data = await gql<{
		updateExtension: { extension: Extension | null };
	}>(
		`mutation($pkgName: String!, $install: Boolean, $uninstall: Boolean, $update: Boolean) {
			updateExtension(
				input: { id: $pkgName, patch: { install: $install, uninstall: $uninstall, update: $update } }
			) {
				extension { ${EXTENSION_FIELDS} }
			}
		}`,
		{ pkgName, ...patch }
	);
	return data.updateExtension.extension;
}

export async function getInstalledSources(isNsfw: boolean | null = false): Promise<Source[]> {
	const data = await gql<{
		sources: { nodes: Source[] };
	}>(
		`query($isNsfw: Boolean) {
			sources(condition: { isNsfw: $isNsfw }) {
				nodes { ${SOURCE_FIELDS} }
			}
		}`,
		{ isNsfw }
	);
	return data.sources.nodes;
}

export async function getSourceById(id: string): Promise<(Source & { baseUrl?: string }) | null> {
	try {
		const data = await gql<{ source: Source & { baseUrl?: string } }>(
			`query($id: LongString!) {
				source(id: $id) {
					${SOURCE_FIELDS}
					baseUrl
				}
			}`,
			{ id }
		);
		return data.source;
	} catch {
		try {
			const data = await gql<{ source: Source }>(
				`query($id: LongString!) {
					source(id: $id) { ${SOURCE_FIELDS} }
				}`,
				{ id }
			);
			return data.source;
		} catch {
			return null;
		}
	}
}

export async function fetchSourceManga(
	sourceId: string,
	type: FetchMangaType,
	page: number,
	query = '',
	filters: FilterChangeInput[] = []
): Promise<{ mangas: Manga[]; hasNextPage: boolean }> {
	const data = await gql<{
		fetchSourceManga: { mangas: Manga[]; hasNextPage: boolean };
	}>(
		`mutation($source: LongString!, $type: FetchSourceMangaType!, $page: Int!, $query: String, $filters: [FilterChangeInput!]) {
			fetchSourceManga(input: { source: $source, type: $type, page: $page, query: $query, filters: $filters }) {
				hasNextPage
				mangas { ${MANGA_FIELDS} }
			}
		}`,
		{ source: sourceId, type, page, query: query || null, filters: filters.length ? filters : null }
	);
	return data.fetchSourceManga;
}

type MangaEnrichment = {
	id: number;
	status: string;
	genre: string[];
	latestUploadedChapter: { name: string; chapterNumber: number; uploadDate: string } | null;
};

export async function getMangasDetail(ids: number[]): Promise<MangaEnrichment[]> {
	if (!ids.length) return [];
	try {
		const data = await gql<{ mangas: { nodes: MangaEnrichment[] } }>(
			`query($ids: [Int!]) {
				mangas(filter: { id: { in: $ids } }) {
					nodes {
						id status genre
						latestUploadedChapter { name chapterNumber uploadDate }
					}
				}
			}`,
			{ ids }
		);
		return data.mangas.nodes;
	} catch {
		return [];
	}
}

export async function fetchBrowseManga(
	sourceId: string,
	type: FetchMangaType,
	page: number,
	query = '',
	filters: FilterChangeInput[] = []
): Promise<{ mangas: BrowseManga[]; hasNextPage: boolean }> {
	const fields = `
		id title thumbnailUrl inLibrary sourceId
		status genre
		latestUploadedChapter { name chapterNumber uploadDate }
	`;
	const data = await gql<{
		fetchSourceManga: { mangas: BrowseManga[]; hasNextPage: boolean };
	}>(
		`mutation($source: LongString!, $type: FetchSourceMangaType!, $page: Int!, $query: String, $filters: [FilterChangeInput!]) {
			fetchSourceManga(input: { source: $source, type: $type, page: $page, query: $query, filters: $filters }) {
				hasNextPage
				mangas { ${fields} }
			}
		}`,
		{ source: sourceId, type, page, query: query || null, filters: filters.length ? filters : null }
	);
	return data.fetchSourceManga;
}

export async function getSourceFilters(sourceId: string): Promise<SourceFilter[]> {
	try {
		const data = await gql<{ source: { filters: unknown[] } }>(
			`query($id: LongString!) {
				source(id: $id) {
					filters {
						__typename
						... on CheckBoxFilter { name }
						... on HeaderFilter { name }
						... on SelectFilter { name values }
						... on SeparatorFilter { name }
						... on SortFilter { name values }
						... on TextFilter { name }
						... on TriStateFilter { name }
						... on GroupFilter {
							name
							filters {
								__typename
								... on CheckBoxFilter { name }
								... on TriStateFilter { name }
								... on TextFilter { name }
								... on SelectFilter { name values }
							}
						}
					}
				}
			}`,
			{ id: sourceId }
		);
		return (data.source?.filters ?? []).map(initFilterState);
	} catch (e) {
		console.error('[getSourceFilters]', e);
		return [];
	}
}

function initFilterState(f: unknown): SourceFilter {
	const filter = f as { __typename: string; name: string; values?: string[]; filters?: unknown[] };
	switch (filter.__typename) {
		case 'CheckBoxFilter': return { __typename: 'CheckBoxFilter', name: filter.name, state: false };
		case 'SelectFilter': return { __typename: 'SelectFilter', name: filter.name, values: filter.values ?? [], state: 0 };
		case 'SortFilter': return { __typename: 'SortFilter', name: filter.name, values: filter.values ?? [], state: null };
		case 'TextFilter': return { __typename: 'TextFilter', name: filter.name, state: '' };
		case 'TriStateFilter': return { __typename: 'TriStateFilter', name: filter.name, state: 'IGNORED' };
		case 'GroupFilter': return { __typename: 'GroupFilter', name: filter.name, filters: (filter.filters ?? []).map(initFilterState) as Parameters<typeof initFilterState>[] extends never[] ? never : ReturnType<typeof initFilterState>[] } as import('./types').GroupFilter;
		case 'HeaderFilter': return { __typename: 'HeaderFilter', name: filter.name };
		case 'SeparatorFilter': return { __typename: 'SeparatorFilter', name: filter.name };
		default: return { __typename: 'HeaderFilter', name: filter.name };
	}
}

export async function fetchMangaDetail(id: number): Promise<MangaDetail> {
	const data = await gql<{
		fetchManga: { manga: MangaDetail };
	}>(
		`mutation($id: Int!) {
			fetchManga(input: { id: $id }) {
				manga {
					${MANGA_FIELDS}
					author artist description genre status
				}
			}
		}`,
		{ id }
	);
	return data.fetchManga.manga;
}

export async function fetchChapters(mangaId: number): Promise<Chapter[]> {
	const data = await gql<{
		fetchChapters: { chapters: Chapter[] };
	}>(
		`mutation($mangaId: Int!) {
			fetchChapters(input: { mangaId: $mangaId }) {
				chapters {
					id name chapterNumber isRead isDownloaded lastPageRead uploadDate sourceOrder pageCount
				}
			}
		}`,
		{ mangaId }
	);
	return data.fetchChapters.chapters.sort((a, b) => b.sourceOrder - a.sourceOrder);
}

export async function fetchChapterPages(chapterId: number): Promise<string[]> {
	const data = await gql<{
		fetchChapterPages: { pages: string[] };
	}>(
		`mutation($chapterId: Int!) {
			fetchChapterPages(input: { chapterId: $chapterId }) {
				pages
			}
		}`,
		{ chapterId }
	);
	return data.fetchChapterPages.pages;
}

export async function updateChapterProgress(
	chapterId: number,
	lastPageRead: number,
	isRead = false
): Promise<void> {
	await gql(
		`mutation($id: Int!, $lastPageRead: Int!, $isRead: Boolean) {
			updateChapter(input: { id: $id, patch: { lastPageRead: $lastPageRead, isRead: $isRead } }) {
				chapter { id lastPageRead isRead }
			}
		}`,
		{ id: chapterId, lastPageRead, isRead }
	);
}

export async function getMangaChapters(mangaId: number): Promise<Chapter[]> {
	const data = await gql<{
		manga: { chapters: { nodes: Chapter[] } };
	}>(
		`query($id: Int!) {
			manga(id: $id) {
				chapters {
					nodes {
						id name chapterNumber isRead isDownloaded lastPageRead uploadDate sourceOrder pageCount
					}
				}
			}
		}`,
		{ id: mangaId }
	);
	return data.manga.chapters.nodes.sort((a, b) => b.sourceOrder - a.sourceOrder);
}

const LIBRARY_CHAPTER_FIELDS = `
	id name lastPageRead
`;

const LIBRARY_MANGA_FIELDS = `
	${MANGA_FIELDS}
	unreadCount
	lastReadChapter { ${LIBRARY_CHAPTER_FIELDS} }
	firstUnreadChapter { id name }
	latestUploadedChapter { id name }
`;

export async function getLibraryManga(categoryId?: number): Promise<LibraryManga[]> {
	const filter = categoryId
		? `inLibrary: { equalTo: true }, categoryId: { equalTo: ${categoryId} }`
		: `inLibrary: { equalTo: true }`;

	const data = await gql<{
		mangas: { nodes: LibraryManga[] };
	}>(
		`query {
			mangas(
				filter: { ${filter} }
				orderBy: IN_LIBRARY_AT
				orderByType: DESC
			) {
				nodes { ${LIBRARY_MANGA_FIELDS} }
			}
		}`
	);
	return data.mangas.nodes;
}

export async function setMangaInLibrary(mangaId: number, inLibrary: boolean): Promise<Manga> {
	const data = await gql<{
		updateManga: { manga: Manga };
	}>(
		`mutation($id: Int!, $inLibrary: Boolean!) {
			updateManga(input: { id: $id, patch: { inLibrary: $inLibrary } }) {
				manga { ${MANGA_FIELDS} }
			}
		}`,
		{ id: mangaId, inLibrary }
	);
	return data.updateManga.manga;
}

export async function getRecentlyReadChapters(limit = 12): Promise<RecentChapter[]> {
	const data = await gql<{
		chapters: { nodes: RecentChapter[] };
	}>(
		`query($limit: Int!) {
			chapters(
				filter: { isRead: { equalTo: false }, inLibrary: { equalTo: true } }
				orderBy: LAST_READ_AT
				orderByType: DESC
				first: $limit
			) {
				nodes {
					id name mangaId lastPageRead lastReadAt
					manga { id title thumbnailUrl }
				}
			}
		}`,
		{ limit }
	);
	return data.chapters.nodes.filter((c) => Number(c.lastReadAt) > 0);
}

export async function getAboutServer(): Promise<AboutServer> {
	const data = await gql<{ aboutServer: AboutServer }>(
		`query {
			aboutServer {
				name version revision buildType
			}
		}`
	);
	return data.aboutServer;
}

export async function getSettings(): Promise<ServerSettings> {
	const data = await gql<{ settings: ServerSettings }>(
		`query {
			settings {
				autoDownloadNewChapters
				autoDownloadNewChaptersLimit
				updateMangas
				globalUpdateInterval
				downloadsPath
				extensionRepos
			}
		}`
	);
	return data.settings;
}

export async function updateSettings(
	patch: Partial<ServerSettings>
): Promise<ServerSettings> {
	const data = await gql<{
		setSettings: { settings: ServerSettings };
	}>(
		`mutation($settings: PartialSettingsTypeInput!) {
			setSettings(input: { settings: $settings }) {
				settings {
					autoDownloadNewChapters
					autoDownloadNewChaptersLimit
					updateMangas
					globalUpdateInterval
					downloadsPath
					extensionRepos
				}
			}
		}`,
		{ settings: patch }
	);
	return data.setSettings.settings;
}

export async function clearServerImageCache(): Promise<void> {
	await gql(
		`mutation {
			clearCachedImages(input: { cachedPages: true, cachedThumbnails: true }) {
				cachedPages cachedThumbnails
			}
		}`
	);
}

export async function getCategories(): Promise<Category[]> {
	const data = await gql<{
		categories: {
			nodes: Array<Category & { mangas: { totalCount: number } }>;
		};
	}>(
		`query {
			categories(orderBy: ORDER, orderByType: ASC) {
				nodes {
					id name order default
					mangas { totalCount }
				}
			}
		}`
	);
	return data.categories.nodes.map((c) => ({
		id: c.id,
		name: c.name,
		order: c.order,
		default: c.default,
		mangaCount: c.mangas.totalCount
	}));
}

export async function createCategory(name: string): Promise<Category> {
	const data = await gql<{
		createCategory: { category: Category };
	}>(
		`mutation($name: String!) {
			createCategory(input: { name: $name }) {
				category { id name order default }
			}
		}`,
		{ name }
	);
	return data.createCategory.category;
}

export async function deleteCategory(categoryId: number): Promise<void> {
	await gql(
		`mutation($id: Int!) {
			deleteCategory(input: { categoryId: $id }) {
				category { id }
			}
		}`,
		{ id: categoryId }
	);
}

export async function getCategoryManga(categoryId: number): Promise<Manga[]> {
	const data = await gql<{
		mangas: { nodes: Manga[] };
	}>(
		`query($id: Int!) {
			mangas(filter: { categoryId: { equalTo: $id } }, orderBy: TITLE, orderByType: ASC) {
				nodes { ${MANGA_FIELDS} }
			}
		}`,
		{ id: categoryId }
	);
	return data.mangas.nodes;
}

export async function getMangaCategories(mangaId: number): Promise<Category[]> {
	const data = await gql<{
		manga: { categories: { nodes: Category[] } };
	}>(
		`query($id: Int!) {
			manga(id: $id) {
				categories { nodes { id name order default } }
			}
		}`,
		{ id: mangaId }
	);
	return data.manga.categories.nodes;
}

export async function updateMangaCategories(
	mangaId: number,
	addToCategories: number[],
	removeFromCategories: number[]
): Promise<Category[]> {
	const data = await gql<{
		updateMangaCategories: { manga: { categories: { nodes: Category[] } } };
	}>(
		`mutation($id: Int!, $add: [Int!], $remove: [Int!]) {
			updateMangaCategories(
				input: { id: $id, patch: { addToCategories: $add, removeFromCategories: $remove } }
			) {
				manga { categories { nodes { id name order default } } }
			}
		}`,
		{
			id: mangaId,
			add: addToCategories.length ? addToCategories : null,
			remove: removeFromCategories.length ? removeFromCategories : null
		}
	);
	return data.updateMangaCategories.manga.categories.nodes;
}

export async function getReadingHistory(limit = 50): Promise<HistoryChapter[]> {
	const data = await gql<{
		chapters: { nodes: HistoryChapter[] };
	}>(
		`query($limit: Int!) {
			chapters(
				filter: { lastReadAt: { greaterThan: "0" } }
				orderBy: LAST_READ_AT
				orderByType: DESC
				first: $limit
			) {
				nodes {
					id name lastReadAt lastPageRead isRead mangaId
					manga { id title thumbnailUrl }
				}
			}
		}`,
		{ limit }
	);
	return data.chapters.nodes;
}

export async function markChapterRead(chapterId: number, isRead: boolean): Promise<void> {
	await gql(
		`mutation($id: Int!, $isRead: Boolean!) {
			updateChapter(input: { id: $id, patch: { isRead: $isRead } }) {
				chapter { id isRead }
			}
		}`,
		{ id: chapterId, isRead }
	);
}

export async function markChaptersRead(chapterIds: number[], isRead: boolean): Promise<void> {
	if (!chapterIds.length) return;
	await gql(
		`mutation($ids: [Int!]!, $isRead: Boolean!) {
			updateChapters(input: { ids: $ids, patch: { isRead: $isRead } }) {
				chapters { id isRead }
			}
		}`,
		{ ids: chapterIds, isRead }
	);
}