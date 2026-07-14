import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { authEnabled, allowGuest } from '$lib/server/env';
import { isPublicPath, isSuwayomiApiPath, isGuestAllowedGraphql } from '$lib/server/guard';
import { getUserFromSession, readSessionToken } from '$lib/server/session';
import { rateLimit } from '$lib/server/ratelimit';

const SUWAYOMI_URL = env.SUWAYOMI_URL || 'http://localhost:4567';

// Each browse page fans out into many upstream scrape calls (enrichment), so the
// per-IP ceiling is high — it's a runaway/abuse backstop, not a UX throttle.
const PROXY_LIMIT = 600;
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

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

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

		if (guest) {
			if (!allowGuest()) return unauthorized('Unauthorized');

			// Guests may read (queries + Suwayomi read-fetch mutations) but not
			// perform owner/server writes. Non-GET image/v1 calls need a session.
			if (pathname.startsWith('/api/graphql')) {
				bodyText = await event.request.text();
				if (!isGuestAllowedGraphql(bodyText)) return unauthorized('Login required');
			} else if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
				return unauthorized('Login required');
			}
		}

		const target = `${SUWAYOMI_URL}${pathname}${event.url.search}`;
		const headers = new Headers(event.request.headers);
		headers.delete('host');
		headers.delete('accept-encoding');

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

		let upstream: Response;
		try {
			upstream = await fetch(target, init);
		} catch (e) {
			const name = e instanceof Error ? e.name : '';
			if (name === 'TimeoutError' || name === 'AbortError') {
				return new Response(JSON.stringify({ errors: [{ message: 'Upstream timeout' }] }), {
					status: 504,
					headers: { 'content-type': 'application/json' }
				});
			}
			throw e;
		}

		const body = await upstream.arrayBuffer();
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
