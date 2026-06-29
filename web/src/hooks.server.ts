import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { authEnabled } from '$lib/server/env';
import { isPublicPath, isSuwayomiApiPath } from '$lib/server/guard';
import {
	getUserFromSession,
	readSessionToken
} from '$lib/server/session';

const SUWAYOMI_URL = env.SUWAYOMI_URL || 'http://localhost:4567';

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

	if (authEnabled() && isSuwayomiApiPath(pathname) && !event.locals.user) {
		return new Response(JSON.stringify({ errors: [{ message: 'Unauthorized' }] }), {
			status: 401,
			headers: { 'content-type': 'application/json' }
		});
	}

	if (pathname.startsWith('/api/') && isSuwayomiApiPath(pathname)) {
		const target = `${SUWAYOMI_URL}${pathname}${event.url.search}`;
		const headers = new Headers(event.request.headers);
		headers.delete('host');
		headers.delete('accept-encoding');

		const init: RequestInit & { duplex?: 'half' } = {
			method: event.request.method,
			headers
		};

		if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
			init.body = event.request.body;
			init.duplex = 'half';
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

	if (authEnabled() && !event.locals.user && !isPublicPath(pathname)) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(pathname)}`);
	}

	// Admin gate — covers POST form actions too (load functions run AFTER actions,
	// so the +layout.server guard alone does NOT protect mutating actions).
	if (authEnabled() && pathname.startsWith('/admin') && !event.locals.user?.is_admin) {
		redirect(303, '/');
	}

	return resolve(event);
};