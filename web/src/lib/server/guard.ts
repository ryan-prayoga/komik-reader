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
 * Unused helper — kept for potential future use.
 * Product decision: `/downloads` stays guest-accessible (local-first offline
 * chapters in IndexedDB; no server session required). Guest page gate in
 * hooks.server.ts only hard-redirects `/admin`. Do not wire this into hooks
 * to re-enforce login on downloads without an explicit product change.
 */
const LOGIN_REQUIRED_PREFIXES = ['/admin'];

export function isPublicPath(pathname: string): boolean {
	if (pathname === '/health' || pathname.startsWith('/health/')) return true;
	if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
	return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * Unused; guest OK for `/downloads`. Not imported by hooks.server.ts.
 * Admin gate is inline (`pathname.startsWith('/admin')`) in hooks instead.
 */
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
] as const;

const GUEST_FETCH_SET: ReadonlySet<string> = new Set(GUEST_FETCH_MUTATIONS);

/**
 * Server-wide Suwayomi ops that must stay admin-only even for logged-in users.
 * Non-admin sessions still get progress/library/category mutations.
 */
const ADMIN_ONLY_MUTATIONS = [
	'setSettings',
	'clearCachedImages',
	'updateExtension'
] as const;

const ADMIN_ONLY_SET: ReadonlySet<string> = new Set(ADMIN_ONLY_MUTATIONS);

	function isMutation(query: string): boolean {
		return /(^|[\s})])mutation[\s({]/.test(query);
	}

	/** Remove # and /* comments so allowlist matching cannot be bypassed via comment text. */
	function stripGraphqlComments(query: string): string {
		return query.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/#[^\n\r]*/g, ' ');
	}

	/** Neutralize string contents so braces inside literals do not skew brace-depth scanning. */
	function stripGraphqlStrings(query: string): string {
		return query
			.replace(/"""[\s\S]*?"""/g, '""')
			.replace(/"(?:\\.|[^"\\])*"/g, '""');
	}

	function skipWs(s: string, i: number): number {
		while (i < s.length && /\s/.test(s[i]!)) i++;
		return i;
	}

	function skipBalanced(s: string, i: number, open: string, close: string): number | null {
		if (s[i] !== open) return null;
		let depth = 0;
		for (; i < s.length; i++) {
			if (s[i] === open) depth++;
			else if (s[i] === close) {
				depth--;
				if (depth === 0) return i + 1;
			}
		}
		return null;
	}

	/** Extract mutation root field names; null = unparseable (deny). */
	function mutationRootFields(query: string): string[] | null {
		const s = stripGraphqlStrings(stripGraphqlComments(query));
		const fields: string[] = [];
		const opRe = /(^|[\s})])mutation(?=[\s({])/g;
		let m: RegExpExecArray | null;
		let found = false;

		while ((m = opRe.exec(s)) !== null) {
			found = true;
			let i = m.index + m[0].length;
			i = skipWs(s, i);

			if (i < s.length && /[A-Za-z_]/.test(s[i]!)) {
				while (i < s.length && /[A-Za-z0-9_]/.test(s[i]!)) i++;
				i = skipWs(s, i);
			}

			if (s[i] === '(') {
				const next = skipBalanced(s, i, '(', ')');
				if (next === null) return null;
				i = skipWs(s, next);
			}

			while (s[i] === '@') {
				i++;
				while (i < s.length && /[A-Za-z0-9_]/.test(s[i]!)) i++;
				i = skipWs(s, i);
				if (s[i] === '(') {
					const next = skipBalanced(s, i, '(', ')');
					if (next === null) return null;
					i = skipWs(s, next);
				}
			}

			if (s[i] !== '{') return null;
			i++;
			let depth = 1;

			while (i < s.length && depth > 0) {
				const c = s[i]!;
				if (c === '{') {
					depth++;
					i++;
					continue;
				}
				if (c === '}') {
					depth--;
					i++;
					continue;
				}

				if (depth !== 1) {
					i++;
					continue;
				}

				if (/\s|,/.test(c)) {
					i++;
					continue;
				}

				if (c === '.' && s.slice(i, i + 3) === '...') return null;
				if (c === '@') return null;
				if (!/[A-Za-z_]/.test(c)) return null;

				let name = '';
				while (i < s.length && /[A-Za-z0-9_]/.test(s[i]!)) {
					name += s[i];
					i++;
				}
				i = skipWs(s, i);

				if (s[i] === ':') {
					i++;
					i = skipWs(s, i);
					if (!/[A-Za-z_]/.test(s[i] ?? '')) return null;
					name = '';
					while (i < s.length && /[A-Za-z0-9_]/.test(s[i]!)) {
						name += s[i];
						i++;
					}
					i = skipWs(s, i);
				}

				fields.push(name);

				if (s[i] === '(') {
					const next = skipBalanced(s, i, '(', ')');
					if (next === null) return null;
					i = skipWs(s, next);
				}

				while (s[i] === '@') {
					i++;
					while (i < s.length && /[A-Za-z0-9_]/.test(s[i]!)) i++;
					i = skipWs(s, i);
					if (s[i] === '(') {
						const next = skipBalanced(s, i, '(', ')');
						if (next === null) return null;
						i = skipWs(s, next);
					}
				}
			}

			if (depth !== 0) return null;
		}

		if (!found) return null;
		return fields;
	}

	function forEachGraphqlOp(
	bodyText: string,
	fn: (cleanedQuery: string) => boolean
): boolean {
	if (!bodyText?.trim()) return false;
	try {
		const parsed = JSON.parse(bodyText);
		const ops = Array.isArray(parsed) ? parsed : [parsed];
		return ops.every((op) => {
			if (op == null || typeof op !== 'object') return false;
			const q = String((op as { query?: unknown }).query ?? '');
			if (!q.trim()) return false;
			return fn(stripGraphqlComments(q));
		});
	} catch {
		return false;
	}
}

/**
 * Guest GraphQL gate: non-mutations allowed; mutations only if every root field
 * is an exact GUEST_FETCH name. Empty/invalid/unparseable bodies denied.
 */
export function isGuestAllowedGraphql(bodyText: string): boolean {
	return forEachGraphqlOp(bodyText, (cleaned) => {
		if (!isMutation(cleaned)) return true;
		const roots = mutationRootFields(cleaned);
		if (!roots || roots.length === 0) return false;
		return roots.every((f) => GUEST_FETCH_SET.has(f));
	});
}

/**
 * Logged-in non-admin gate: queries OK; mutations OK unless any root field is
 * an admin-only server control (settings / extension install / cache clear).
 * Unparseable mutation bodies denied closed.
 */
export function isUserAllowedGraphql(bodyText: string): boolean {
	return forEachGraphqlOp(bodyText, (cleaned) => {
		if (!isMutation(cleaned)) return true;
		const roots = mutationRootFields(cleaned);
		if (!roots || roots.length === 0) return false;
		return roots.every((f) => !ADMIN_ONLY_SET.has(f));
	});
}
