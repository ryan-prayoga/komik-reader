import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { authEnabled, allowGuest } from '$lib/server/env';
import {
	isPublicPath,
	isSuwayomiApiPath,
	isGuestAllowedGraphql,
	isUserAllowedGraphql,
	isGuestAllowedRest,
	isUserAllowedRest
} from '$lib/server/guard';
import { getUserFromSession, readSessionToken } from '$lib/server/session';
import { rateLimit } from '$lib/server/ratelimit';

const SUWAYOMI_URL = env.SUWAYOMI_URL || 'http://localhost:4567';

// Each browse page fans out into many upstream scrape calls (enrichment), so the
// per-IP ceiling is high — it's a runaway/abuse backstop, not a UX throttle.
const PROXY_LIMIT = process.env.NODE_ENV === 'production' ? 600 : 10_000;
const PROXY_WINDOW_MS = 60_000;
// Match client GRAPHQL_TIMEOUT_MS so a hung Suwayomi scrape fails closed here too.
const PROXY_TIMEOUT_MS = 30_000;

function unauthorized(message: string): Response {
	return new Response(JSON.stringify({ errors: [{ message }] }), {
		status: 401,
		headers: { 'content-type': 'application/json' }
	});
}

function tooManyRequests(retryAfter: number): Response {
	return new Response(JSON.stringify({ errors: [{ message: 'Terlalu banyak permintaan' }] }), {
		status: 429,
		headers: { 'content-type': 'application/json', 'retry-after': String(retryAfter) }
	});
}

/**
 * SvelteKit matches routes on the DECODED pathname but leaves `url.pathname`
 * percent-encoded, so gating on the raw value let `/%61dmin/users` route to
 * `/admin/users` while `startsWith('/admin')` read false. Every access check
 * below uses this; only the proxy target URL keeps the raw form. Malformed
 * escapes fail closed to the raw string rather than throwing.
 */
function decodedPathname(url: URL): string {
	try {
		return decodeURIComponent(url.pathname);
	} catch {
		return url.pathname;
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const rawPathname = event.url.pathname;
	const pathname = decodedPathname(event.url);

	if (authEnabled()) {
		const token = readSessionToken(event.cookies);
		event.locals.user = getUserFromSession(token);
	} else {
		event.locals.user = null;
	}

	if (pathname === '/logout') {
		return resolve(event);
	}

	// ── Suwayomi API proxy ───────────────────────────────────────────────────
	// Local SvelteKit API routes under /api/ext/ are NOT proxied to Suwayomi.
	if (pathname.startsWith('/api/') && !pathname.startsWith('/api/ext/') && isSuwayomiApiPath(pathname)) {
		const guest = authEnabled() && !event.locals.user;

		// Per-IP throttle on the upstream scrape proxy so a single client (esp. an
		// anonymous guest) can't hammer sources into an IP ban or exhaust the box.
		const proxyLimit = rateLimit(`proxy:${event.getClientAddress()}`, PROXY_LIMIT, PROXY_WINDOW_MS);
		if (!proxyLimit.ok) return tooManyRequests(proxyLimit.retryAfter);

		let bodyText: string | undefined;
		const isGraphql = pathname.startsWith('/api/graphql');
		const user = event.locals.user;
		const isAdmin = Boolean(user?.is_admin);

		// GraphQL body must be buffered whenever we role-gate mutations (guest or
		// non-admin). Admins pass through without parsing.
		if (isGraphql && authEnabled() && (guest || (user && !isAdmin))) {
			bodyText = await event.request.text();
			if (guest) {
				if (!allowGuest()) return unauthorized('Unauthorized');
				if (!isGuestAllowedGraphql(bodyText)) return unauthorized('Login required');
			} else if (!isUserAllowedGraphql(bodyText)) {
				return unauthorized('Admin required');
			}
		} else if (!isGraphql && authEnabled()) {
			// REST /api/v1/* — block mutation-via-GET (downloads, backup, extension
			// install) for guests and non-admins. Admins pass through.
			if (guest) {
				if (!allowGuest()) return unauthorized('Unauthorized');
				if (!isGuestAllowedRest(pathname, event.request.method)) {
					return unauthorized('Login required');
				}
			} else if (user && !isAdmin) {
				if (!isUserAllowedRest(pathname, event.request.method)) {
					return unauthorized('Admin required');
				}
			}
		}

		// Raw (still-encoded) path here — the gates above ran on the decoded form,
		// but the upstream request must reproduce the client's original path.
		const target = `${SUWAYOMI_URL}${rawPathname}${event.url.search}`;
		const headers = new Headers(event.request.headers);
		headers.delete('host');
		headers.delete('accept-encoding');
		// Never forward the app session cookie to Suwayomi.
		headers.delete('cookie');

		const init: RequestInit & { duplex?: 'half' } = {
			method: event.request.method,
			headers,
			signal: AbortSignal.timeout(PROXY_TIMEOUT_MS)
		};

		if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
			if (bodyText !== undefined) {
				init.body = bodyText; // already buffered for the mutation check
			} else {
				init.body = event.request.body;
				init.duplex = 'half';
			}
		}

		// One JSON error shape for every upstream failure. Clients here parse JSON;
		// letting an exception escape produced SvelteKit's 500 HTML page instead,
		// which they cannot read — so a downed Suwayomi or a slow body surfaced as
		// an unhelpful parse error rather than a clear message.
		const upstreamError = (status: number, message: string) =>
			new Response(JSON.stringify({ errors: [{ message }] }), {
				status,
				headers: { 'content-type': 'application/json' }
			});
		const isAbort = (e: unknown) => {
			const name = e instanceof Error ? e.name : '';
			return name === 'TimeoutError' || name === 'AbortError';
		};

		let upstream: Response;
		try {
			upstream = await fetch(target, init);
		} catch (e) {
			if (isAbort(e)) return upstreamError(504, 'Upstream timeout');
			return upstreamError(502, 'Server komik tidak dapat dihubungi');
		}

		let body: ArrayBuffer;
		try {
			// The 30s timeout is still armed while the body streams, so a large or
			// slow response can abort HERE — outside the try above, this threw
			// uncaught and took the whole request to a 500 HTML page.
			body = await upstream.arrayBuffer();
		} catch (e) {
			if (isAbort(e)) return upstreamError(504, 'Upstream timeout');
			return upstreamError(502, 'Gagal membaca respons server komik');
		}

		const contentType = upstream.headers.get('content-type');

		const outHeaders = new Headers();
		if (contentType) outHeaders.set('content-type', contentType);
		if (upstream.headers.get('cache-control')) {
			outHeaders.set('cache-control', upstream.headers.get('cache-control')!);
		}

		return new Response(body, {
			status: upstream.status,
			statusText: upstream.statusText,
			headers: outHeaders
		});
	}

	// ── Page access ──────────────────────────────────────────────────────────
	if (authEnabled() && !event.locals.user) {
		if (allowGuest()) {
			// Guests browse/read freely; save-feature pages gate inline client-side.
			// Admin is the exception — hard-redirect to login (also protects actions).
			if (pathname.startsWith('/admin')) {
				redirect(303, `/login?redirectTo=${encodeURIComponent(pathname)}`);
			}
		} else if (!isPublicPath(pathname)) {
			redirect(303, `/login?redirectTo=${encodeURIComponent(pathname)}`);
		}
	}

	// Admin gate — covers POST form actions too (load functions run AFTER actions).
	if (authEnabled() && pathname.startsWith('/admin') && !event.locals.user?.is_admin) {
		redirect(303, '/');
	}

	return resolve(event);
};
