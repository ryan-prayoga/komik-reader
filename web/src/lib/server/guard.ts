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
 * Save-feature + owner routes that always require a session, even in
 * optional-auth (guest) mode. Browsing/reading routes are intentionally absent.
 */
const LOGIN_REQUIRED_PREFIXES = [
	'/library',
	'/history',
	'/downloads',
	'/categories',
	'/extensions',
	'/admin'
];

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
	return (
		pathname.startsWith('/api/graphql') ||
		pathname.startsWith('/api/v1/') ||
		(pathname.startsWith('/api/') &&
			!pathname.startsWith('/api/auth/') &&
			pathname !== '/api/auth')
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
