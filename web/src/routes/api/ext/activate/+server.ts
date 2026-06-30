import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';

const SUWAYOMI_URL = env.SUWAYOMI_URL || 'http://localhost:4567';

async function graphql(query: string, variables?: Record<string, unknown>) {
	const res = await fetch(`${SUWAYOMI_URL}/api/graphql`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query, variables })
	});
	return res.json();
}

// Guests may trigger extension installs (server-wide, one-way only).
// Uninstall and update are not exposed here — those require a session.
export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const pkgName = typeof (body as Record<string, unknown>)?.pkgName === 'string'
		? (body as Record<string, unknown>).pkgName as string
		: null;

	if (!pkgName) return json({ error: 'pkgName required' }, { status: 400 });

	const data = await graphql(
		`mutation($pkgName: String!) {
			updateExtension(input: { id: $pkgName, patch: { install: true } }) {
				extension { pkgName isInstalled }
			}
		}`,
		{ pkgName }
	);

	if (data?.errors?.length) {
		return json({ error: data.errors[0]?.message ?? 'Install failed' }, { status: 500 });
	}

	const ext = data?.data?.updateExtension?.extension;
	if (!ext) return json({ error: 'Extension not found' }, { status: 404 });

	// Track activation count (best-effort — never fails the response).
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

	return json({ pkgName: ext.pkgName, isInstalled: ext.isInstalled });
};
