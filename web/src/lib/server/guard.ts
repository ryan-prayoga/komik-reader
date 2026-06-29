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
const LOGIN_REQUIRED_PREFIXES = ['/downloads', '/extensions', '/admin'];

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
	return (
		pathname.startsWith('/api/graphql') ||
		pathname.startsWith('/api/v1/') ||
		pathname.startsWith('/api/')
	);
}

/**
 * Detect a GraphQL write so guests can read but not mutate. Operates on the raw
 * request body text: a top-level `mutation` operation marks a write. Queries
 * (browse/search/manga/pages) pass through for guests.
 */
export function isGraphqlMutation(bodyText: string): boolean {
	if (!bodyText) return false;
	try {
		const parsed = JSON.parse(bodyText);
		const ops = Array.isArray(parsed) ? parsed : [parsed];
		return ops.some((op) => /(^|[\s})])mutation[\s({]/.test(String(op?.query ?? '')));
	} catch {
		// Unparseable body — be safe and treat as a write.
		return true;
	}
}
