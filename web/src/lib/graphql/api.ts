import { gql } from './client';
import type { Chapter, Extension, FetchMangaType, Manga, MangaDetail, Source } from './types';

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

export async function fetchSourceManga(
	sourceId: string,
	type: FetchMangaType,
	page: number,
	query = ''
): Promise<{ mangas: Manga[]; hasNextPage: boolean }> {
	const data = await gql<{
		fetchSourceManga: { mangas: Manga[]; hasNextPage: boolean };
	}>(
		`mutation($source: LongString!, $type: FetchSourceMangaType!, $page: Int!, $query: String) {
			fetchSourceManga(input: { source: $source, type: $type, page: $page, query: $query }) {
				hasNextPage
				mangas { ${MANGA_FIELDS} }
			}
		}`,
		{ source: sourceId, type, page, query: query || null }
	);
	return data.fetchSourceManga;
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
					id name chapterNumber isRead isDownloaded lastPageRead uploadDate sourceOrder
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
						id name chapterNumber isRead isDownloaded lastPageRead uploadDate sourceOrder
					}
				}
			}
		}`,
		{ id: mangaId }
	);
	return data.manga.chapters.nodes.sort((a, b) => b.sourceOrder - a.sourceOrder);
}