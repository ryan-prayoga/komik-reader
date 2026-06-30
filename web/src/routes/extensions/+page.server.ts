import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.is_admin) return { activationCounts: {} };

	const rows = getDb()
		.prepare('SELECT pkg_name, count FROM extension_activations ORDER BY count DESC')
		.all() as { pkg_name: string; count: number }[];

	const activationCounts: Record<string, number> = {};
	for (const row of rows) {
		activationCounts[row.pkg_name] = row.count;
	}

	return { activationCounts };
};
