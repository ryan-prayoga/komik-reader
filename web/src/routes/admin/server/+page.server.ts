import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/admin';
import { getAllowRegistration, setAllowRegistration } from '$lib/server/settings';

export const load: PageServerLoad = async () => {
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