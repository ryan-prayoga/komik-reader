import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/admin';
import { getAllowRegistration, setAllowRegistration } from '$lib/server/settings';

// Re-asserted here, not just in the parent layout — a load node can be skipped
// via `?x-sveltekit-invalidated=`, which exposed this to anonymous requests.
export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.user);
	return { allowRegistration: getAllowRegistration() };
};

export const actions: Actions = {
	auth: async ({ locals, request }) => {
		requireAdmin(locals.user);
		const form = await request.formData();
		setAllowRegistration(form.get('allow_registration') === 'on');
		return { success: 'Pengaturan auth disimpan' };
	}
};