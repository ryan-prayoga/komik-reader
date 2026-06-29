import type { LayoutServerLoad } from './$types';
import { authEnabled, allowGuest } from '$lib/server/env';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		authEnabled: authEnabled(),
		allowGuest: allowGuest()
	};
};
