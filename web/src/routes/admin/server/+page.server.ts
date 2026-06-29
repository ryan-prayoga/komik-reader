import type { Actions, PageServerLoad } from './$types';
import { getAllowRegistration, setAllowRegistration } from '$lib/server/settings';

export const load: PageServerLoad = async () => {
	return { allowRegistration: getAllowRegistration() };
};

export const actions: Actions = {
	auth: async ({ request }) => {
		const form = await request.formData();
		setAllowRegistration(form.get('allow_registration') === 'on');
		return { success: 'Pengaturan auth disimpan' };
	}
};