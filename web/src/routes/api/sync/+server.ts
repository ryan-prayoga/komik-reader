	import { error, json } from '@sveltejs/kit';
	import type { RequestHandler } from './$types';
	import { syncChanges, type IncomingChange } from '$lib/server/sync';
	import { rateLimit } from '$lib/server/ratelimit';

	export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
		if (!locals.user) throw error(401, 'Login required');

		const limit = rateLimit(`sync:${locals.user.id}:${getClientAddress()}`, 120, 60_000);
		if (!limit.ok) {
			return json(
				{ error: 'Terlalu banyak permintaan sync' },
				{ status: 429, headers: { 'retry-after': String(limit.retryAfter) } }
			);
		}

		const body = (await request.json().catch(() => ({}))) as {
			since?: number;
			changes?: IncomingChange[];
		};
		const since = Number(body.since ?? 0) || 0;
		const changes = Array.isArray(body.changes) ? body.changes : [];

		const result = syncChanges(locals.user.id, since, changes);
		return json(result);
	};
