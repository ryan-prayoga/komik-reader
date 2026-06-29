import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { authEnabled, allowGuest } from '$lib/server/env';
import { isPublicPath, isSuwayomiApiPath, isGraphqlMutation } from '$lib/server/guard';
import { getUserFromSession, readSessionToken } from '$lib/server/session';

const SUWAYOMI_URL = env.SUWAYOMI_URL || 'http://localhost:4567';

function unauthorized(message: string): Response {
	return new Response(JSON.stringify({ errors: [{ message }] }), {
		status: 401,
		headers: { 'content-type': 'application/json' }
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
	if (pathname.startsWith('/api/') && isSuwayomiApiPath(pathname)) {
		const guest = authEnabled() && !event.locals.user;
		let bodyText: string | undefined;

		if (guest) {
			if (!allowGuest()) return unauthorized('Unauthorized');

			// Guests may read but not write. GraphQL writes and any non-GET
			// upstream call require a session.
			if (pathname.startsWith('/api/graphql')) {
				bodyText = await event.request.text();
				if (isGraphqlMutation(bodyText)) return unauthorized('Login required');
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
			headers
		};

		if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
			if (bodyText !== undefined) {
				init.body = bodyText; // already buffered for the mutation check
			} else {
				init.body = event.request.body;
				init.duplex = 'half';
			}
		}

		const upstream = await fetch(target, init);
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
