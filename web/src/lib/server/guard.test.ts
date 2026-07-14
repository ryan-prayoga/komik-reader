import { describe, it, expect } from 'vitest';
import { isGuestAllowedGraphql, isPublicPath, isSuwayomiApiPath } from './guard';

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
