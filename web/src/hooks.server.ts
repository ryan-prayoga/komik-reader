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
};