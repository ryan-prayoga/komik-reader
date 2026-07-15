	import { describe, it, expect } from 'vitest';
	import {
		isGuestAllowedGraphql,
		isUserAllowedGraphql,
		isGuestAllowedRest,
		isUserAllowedRest,
		isRestMutationPath,
		isPublicPath,
		isSuwayomiApiPath
	} from './guard';

function gqlBody(query: string): string {
	return JSON.stringify({ query });
}

describe('isPublicPath', () => {
	it('allows auth pages and static prefixes', () => {
		for (const p of ['/login', '/register', '/forgot-password', '/reset-password', '/health']) {
			expect(isPublicPath(p)).toBe(true);
		}
		expect(isPublicPath('/_app/immutable/x.js')).toBe(true);
		expect(isPublicPath('/manifest.webmanifest')).toBe(true);
	});

	it('does NOT treat app pages as public', () => {
		for (const p of ['/', '/library', '/settings', '/manga/1']) {
			expect(isPublicPath(p)).toBe(false);
		}
	});

	it('keeps admin routes private (privilege-escalation guard)', () => {
		expect(isPublicPath('/admin')).toBe(false);
		expect(isPublicPath('/admin/users')).toBe(false);
		expect(isPublicPath('/admin/server')).toBe(false);
	});

	it('is not fooled by lookalike prefixes', () => {
		expect(isPublicPath('/loginx')).toBe(false);
		expect(isPublicPath('/registered')).toBe(false);
	});
});

describe('isSuwayomiApiPath', () => {
	it('matches proxied Suwayomi endpoints', () => {
		expect(isSuwayomiApiPath('/api/graphql')).toBe(true);
		expect(isSuwayomiApiPath('/api/v1/manga/1')).toBe(true);
	});

	it('excludes local auth API', () => {
		expect(isSuwayomiApiPath('/api/auth')).toBe(false);
		expect(isSuwayomiApiPath('/api/auth/login')).toBe(false);
	});

	it('ignores non-api paths', () => {
		expect(isSuwayomiApiPath('/library')).toBe(false);
	});
});

describe('isGuestAllowedGraphql', () => {
	it('allows pure allowlisted fetch mutations', () => {
		expect(
			isGuestAllowedGraphql(
				gqlBody(`mutation($id: Int!) {
					fetchManga(input: { id: $id }) { manga { id } }
				}`)
			)
		).toBe(true);
		expect(
			isGuestAllowedGraphql(
				gqlBody(`mutation {
					fetchSourceManga(input: { source: "1", type: POPULAR, page: 1 }) {
						hasNextPage
					}
				}`)
			)
		).toBe(true);
		expect(
			isGuestAllowedGraphql(
				gqlBody(`mutation($mangaId: Int!) {
					fetchChapters(input: { mangaId: $mangaId }) { chapters { id } }
				}`)
			)
		).toBe(true);
		expect(
			isGuestAllowedGraphql(
				gqlBody(`mutation($chapterId: Int!) {
					fetchChapterPages(input: { chapterId: $chapterId }) { pages }
				}`)
			)
		).toBe(true);
		expect(
			isGuestAllowedGraphql(
				gqlBody(`mutation { fetchExtensions { extensions { pkgName } } }`)
			)
		).toBe(true);
	});

	it('allows multiple allowlisted fetch roots in one mutation', () => {
		expect(
			isGuestAllowedGraphql(
				gqlBody(`mutation {
					fetchManga(input: { id: 1 }) { manga { id } }
					fetchChapters(input: { mangaId: 1 }) { chapters { id } }
				}`)
			)
		).toBe(true);
	});

	it('denies fetch smuggled with a write mutation root', () => {
		expect(
			isGuestAllowedGraphql(
				gqlBody(`mutation {
					fetchManga(input: { id: 1 }) { manga { id } }
					updateExtension(input: { id: "x", patch: { install: true } }) {
						extension { pkgName }
					}
				}`)
			)
		).toBe(false);
	});

	it('denies write mutation even when allowlisted name appears only in a comment', () => {
		expect(
			isGuestAllowedGraphql(
				gqlBody(`mutation {
					# fetchManga
					updateExtension(input: { id: "x", patch: { install: true } }) {
						extension { pkgName }
					}
				}`)
			)
		).toBe(false);
		expect(
			isGuestAllowedGraphql(
				gqlBody(`mutation {
					/* fetchChapters */
					updateExtension(input: { id: "x", patch: { install: true } }) {
						extension { pkgName }
					}
				}`)
			)
		).toBe(false);
	});

	it('denies empty / whitespace / invalid JSON bodies', () => {
		expect(isGuestAllowedGraphql('')).toBe(false);
		expect(isGuestAllowedGraphql('   ')).toBe(false);
		expect(isGuestAllowedGraphql('not-json')).toBe(false);
		expect(isGuestAllowedGraphql(JSON.stringify({ query: '' }))).toBe(false);
		expect(isGuestAllowedGraphql(JSON.stringify({ query: '   ' }))).toBe(false);
	});

	it('allows non-mutation queries', () => {
		expect(
			isGuestAllowedGraphql(
				gqlBody(`query {
					mangas { nodes { id title } }
				}`)
			)
		).toBe(true);
		expect(
			isGuestAllowedGraphql(
				gqlBody(`{
					aboutServer { name version }
				}`)
			)
		).toBe(true);
	});

	it('denies non-allowlisted mutations and non-exact root field names', () => {
		expect(
			isGuestAllowedGraphql(
				gqlBody(`mutation {
					updateExtension(input: { id: "x", patch: { install: true } }) {
						extension { pkgName }
					}
				}`)
			)
		).toBe(false);
		expect(
			isGuestAllowedGraphql(
				gqlBody(`mutation {
					fetchMangaExtra(input: { id: 1 }) { ok }
				}`)
			)
		).toBe(false);
	});

		it('allows batch when every op is guest-safe; denies if any op is not', () => {
			expect(
				isGuestAllowedGraphql(
					JSON.stringify([
						{ query: 'query { aboutServer { name } }' },
						{
							query: `mutation {
								fetchManga(input: { id: 1 }) { manga { id } }
							}`
						}
					])
				)
			).toBe(true);
			expect(
				isGuestAllowedGraphql(
					JSON.stringify([
						{
							query: `mutation {
								fetchManga(input: { id: 1 }) { manga { id } }
							}`
						},
						{
							query: `mutation {
								updateExtension(input: { id: "x", patch: { install: true } }) {
									extension { pkgName }
								}
							}`
						}
					])
				)
			).toBe(false);
		});
	});

	describe('isUserAllowedGraphql', () => {
		it('allows progress and library mutations for non-admin users', () => {
			expect(
				isUserAllowedGraphql(
					gqlBody(`mutation($id: Int!, $lastPageRead: Int!) {
						updateChapter(input: { id: $id, patch: { lastPageRead: $lastPageRead } }) {
							chapter { id }
						}
					}`)
				)
			).toBe(true);
			expect(
				isUserAllowedGraphql(
					gqlBody(`mutation($id: Int!, $inLibrary: Boolean!) {
						updateManga(input: { id: $id, patch: { inLibrary: $inLibrary } }) {
							manga { id }
						}
					}`)
				)
			).toBe(true);
		});

		it('denies admin-only server mutations for non-admin users', () => {
			expect(
				isUserAllowedGraphql(
					gqlBody(`mutation {
						setSettings(input: { settings: { globalUpdateInterval: 1 } }) {
							settings { globalUpdateInterval }
						}
					}`)
				)
			).toBe(false);
			expect(
				isUserAllowedGraphql(
					gqlBody(`mutation {
						updateExtension(input: { id: "x", patch: { install: true } }) {
							extension { pkgName }
						}
					}`)
				)
			).toBe(false);
			expect(
				isUserAllowedGraphql(
					gqlBody(`mutation {
						clearCachedImages(input: { cachedPages: true, cachedThumbnails: true }) {
							cachedPages
						}
					}`)
				)
			).toBe(false);
		});

		it('denies batch when any op is admin-only', () => {
			expect(
				isUserAllowedGraphql(
					JSON.stringify([
						{
							query: `mutation {
								updateChapter(input: { id: 1, patch: { isRead: true } }) {
									chapter { id }
								}
							}`
						},
						{
							query: `mutation {
								setSettings(input: { settings: { updateMangas: true } }) {
									settings { updateMangas }
								}
							}`
						}
					])
				)
			).toBe(false);
		});

		it('allows pure queries', () => {
			expect(isUserAllowedGraphql(gqlBody(`query { aboutServer { name } }`))).toBe(true);
		});

		it('denies expanded admin-only ops (backup, downloader, external install)', () => {
			for (const name of [
				'installExternalExtension',
				'createBackup',
				'restoreBackup',
				'clearDownloader',
				'resetSettings',
				'updateWebUI'
			]) {
				expect(
					isUserAllowedGraphql(gqlBody(`mutation { ${name} { __typename } }`))
				).toBe(false);
			}
		});
	});

	describe('REST path gates', () => {
		it('flags mutation paths including downloads and backup', () => {
			expect(isRestMutationPath('/api/v1/downloads/start')).toBe(true);
			expect(isRestMutationPath('/api/v1/downloads/clear')).toBe(true);
			expect(isRestMutationPath('/api/v1/backup/export/file')).toBe(true);
			expect(isRestMutationPath('/api/v1/manga/12/library')).toBe(true);
			expect(isRestMutationPath('/api/v1/extension/list')).toBe(false);
		});

		it('guest REST allows manga/chapter reads only', () => {
			expect(isGuestAllowedRest('/api/v1/manga/1/thumbnail', 'GET')).toBe(true);
			expect(isGuestAllowedRest('/api/v1/chapter/9/page/0', 'GET')).toBe(true);
			expect(isGuestAllowedRest('/api/v1/extension/list', 'GET')).toBe(true);
			expect(isGuestAllowedRest('/api/v1/downloads/start', 'GET')).toBe(false);
			expect(isGuestAllowedRest('/api/v1/backup/export/file', 'GET')).toBe(false);
			expect(isGuestAllowedRest('/api/v1/manga/1/thumbnail', 'POST')).toBe(false);
		});

		it('non-admin REST blocks mutation GET and all writes', () => {
			expect(isUserAllowedRest('/api/v1/manga/1/thumbnail', 'GET')).toBe(true);
			expect(isUserAllowedRest('/api/v1/downloads/start', 'GET')).toBe(false);
			expect(isUserAllowedRest('/api/v1/backup/export/file', 'GET')).toBe(false);
			expect(isUserAllowedRest('/api/v1/manga/1/library', 'GET')).toBe(false);
			expect(isUserAllowedRest('/api/v1/manga/1/thumbnail', 'POST')).toBe(false);
		});
	});

