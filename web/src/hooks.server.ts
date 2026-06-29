import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const SUWAYOMI_URL = env.SUWAYOMI_URL || 'http://localhost:4567';

export const handle: Handle = async ({ event, resolve }) => {
	if (!event.url.pathname.startsWith('/api/')) {
		return resolve(event);
	}

	const target = `${SUWAYOMI_URL}${event.url.pathname}${event.url.search}`;
	const headers = new Headers(event.request.headers);
	headers.delete('host');
	// Avoid gzip passthrough — Suwayomi compresses, Caddy may re-encode → ERR_CONTENT_DECODING_FAILED
	headers.delete('accept-encoding');

	const init: RequestInit & { duplex?: 'half' } = {
		method: event.request.method,
		headers
	};

	if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
		init.body = event.request.body;
		init.duplex = 'half';
	}

	const response = await fetch(target, init);
	const outHeaders = new Headers(response.headers);
	outHeaders.delete('content-encoding');
	outHeaders.delete('content-length');

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: outHeaders
	});
};