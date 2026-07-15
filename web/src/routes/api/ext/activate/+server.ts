import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { rateLimit } from '$lib/server/ratelimit';

const SUWAYOMI_URL = env.SUWAYOMI_URL || 'http://localhost:4567';

async function graphql(query: string, variables?: Record<string, unknown>) {
	const res = await fetch(`${SUWAYOMI_URL}/api/graphql`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query, variables })
	});
	return res.json();
}

	// Activation counter only — does NOT install APKs (server-wide Suwayomi state).
	// Install/uninstall stays admin GraphQL. Guests may bump counts for analytics.
	export const POST: RequestHandler = async ({ request, getClientAddress }) => {
		const limit = rateLimit(`ext-activate:${getClientAddress()}`, 60, 60 * 60_000);
		if (!limit.ok) {
			return json({ error: 'Terlalu banyak permintaan' }, { status: 429 });
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return json({ error: 'Invalid JSON' }, { status: 400 });
		}

		const pkgName =
			typeof (body as Record<string, unknown>)?.pkgName === 'string'
				? ((body as Record<string, unknown>).pkgName as string)
				: null;

		if (!pkgName || pkgName.length > 200) {
			return json({ error: 'pkgName required' }, { status: 400 });
		}

		try {
			getDb()
				.prepare(
					`INSERT INTO extension_activations (pkg_name, count) VALUES (?, 1)
					 ON CONFLICT(pkg_name) DO UPDATE SET count = count + 1`
				)
				.run(pkgName);
		} catch {
			// ignore
		}

		return json({ pkgName, counted: true });
	};
