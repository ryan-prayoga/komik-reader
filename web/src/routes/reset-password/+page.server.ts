import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authEnabled } from '$lib/server/env';
import { consumePasswordReset } from '$lib/server/reset';
import { updateUserPassword, validatePassword } from '$lib/server/users';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!authEnabled()) redirect(303, '/');
	if (locals.user) redirect(303, '/');

	const token = url.searchParams.get('token')?.trim() ?? '';
	return { token, hasToken: token.length > 0 };
};

export const actions: Actions = {
	default: async ({ request, url }) => {
		const form = await request.formData();
		const token = String(form.get('token') ?? url.searchParams.get('token') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');

		if (!token) return fail(400, { error: 'Token reset tidak valid', token });
		const passErr = validatePassword(password);
		if (passErr) return fail(400, { error: passErr, token });
		if (password !== confirm) {
			return fail(400, { error: 'Konfirmasi password tidak cocok', token });
		}

		const userId = consumePasswordReset(token);
		if (!userId) {
			return fail(400, { error: 'Token tidak valid atau sudah kadaluarsa', token });
		}

		updateUserPassword(userId, password);
		redirect(303, '/login');
	}
};