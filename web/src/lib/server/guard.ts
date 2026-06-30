const PUBLIC_PAGES = ['/login', '/register', '/forgot-password', '/reset-password'];

const PUBLIC_PREFIXES = [
	'/_app/',
	'/icons/',
	'/manifest.webmanifest',
	'/sw.js',
	'/registerSW.js',
	'/robots.txt',
	'/health'
];

/**
 * Server-backed owner routes that require a session even in guest mode.
 * History/library/categories are local-first (client-side) so they are absent —
 * they sync to the account only when logged in.
 */
const LOGIN_REQUIRED_PREFIXES = ['/downloads', '/admin'];

export function isPublicPath(pathname: string): boolean {
	if (pathname === '/health' || pathname.startsWith('/health/')) return true;
	if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
	return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/** A page that requires a logged-in user even when guests are allowed to read. */
export function requiresLogin(pathname: string): boolean {
	return LOGIN_REQUIRED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isSuwayomiApiPath(pathname: string): boolean {
	// Local SvelteKit API routes that must NOT be proxied to Suwayomi.
	if (pathname.startsWith('/api/auth/') || pathname === '/api/auth') return false;
	if (pathname.startsWith('/api/sync')) return false;
	if (pathname.startsWith('/api/ext/')) return false;
	return (
		pathname.startsWith('/api/graphql') ||
		pathname.startsWith('/api/v1/') ||
		pathname.startsWith('/api/')
	);
}

// Suwayomi models source/chapter fetches as GraphQL *mutations* (they trigger a
// network fetch), so guests must be allowed to run these read-oriented ones to
// browse and read. Everything else mutating (library, downloads, categories,
// progress, extensions, settings) stays login-only.
// fetchExtensions is catalog-refresh (read-oriented, no server state change).
const GUEST_FETCH_MUTATIONS = [
	'fetchSourceManga',
	'fetchManga',
	'fetchChapters',
	'fetchChapterPages',
	'fetchExtensions'
];

function isMutation(query: string): boolean {
	return /(^|[\s})])mutation[\s({]/.test(query);
}

/**
 * Whether a guest may run this GraphQL request. Queries always pass; mutations
 * pass only when every operation is a read-oriented fetch (browse/manga/chapter
 * pages). Unparseable bodies are denied.
 */
export function isGuestAllowedGraphql(bodyText: string): boolean {
	if (!bodyText) return true;
	try {
		const parsed = JSON.parse(bodyText);
		const ops = Array.isArray(parsed) ? parsed : [parsed];
		return ops.every((op) => {
			const q = String(op?.query ?? '');
			if (!isMutation(q)) return true;
			return GUEST_FETCH_MUTATIONS.some((f) => q.includes(f));
		});
	} catch {
		return false;
	}
}
