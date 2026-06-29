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

export function isPublicPath(pathname: string): boolean {
	if (pathname === '/health' || pathname.startsWith('/health/')) return true;
	if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
	return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
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