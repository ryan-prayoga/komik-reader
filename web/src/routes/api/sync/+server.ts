import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncChanges, type IncomingChange } from '$lib/server/sync';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Login required');

	const body = (await request.json().catch(() => ({}))) as {
		since?: number;
		changes?: IncomingChange[];
	};
	const since = Number(body.since ?? 0) || 0;
	const changes = Array.isArray(body.changes) ? body.changes : [];

	const result = syncChanges(locals.user.id, since, changes);
	return json(result);
};
