import type { LayoutServerLoad } from './$types';
import { authEnabled } from '$lib/server/env';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		authEnabled: authEnabled()
	};
};