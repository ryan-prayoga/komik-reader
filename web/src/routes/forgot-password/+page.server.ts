import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authEnabled } from '$lib/server/env';
import { canSendEmail, sendPasswordResetEmail } from '$lib/server/email';
import { createPasswordReset } from '$lib/server/reset';
import { findUserByEmail, normalizeEmail, validateEmail } from '$lib/server/users';

export const load: PageServerLoad = async ({ locals }) => {
	if (!authEnabled()) redirect(303, '/');
	if (locals.user) redirect(303, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ request }) => {
		if (!canSendEmail()) {
			return fail(503, {
				error: 'SMTP belum dikonfigurasi. Hubungi admin.',
				email: ''
			});
		}

		const form = await request.formData();
		const email = String(form.get('email') ?? '');

		if (!email) return fail(400, { error: 'Email wajib diisi', email });
		if (!validateEmail(email)) return fail(400, { error: 'Format email tidak valid', email });

		// Always show success to avoid email enumeration
		const user = findUserByEmail(normalizeEmail(email));
		if (user) {
			try {
				const token = createPasswordReset(user.id);
				await sendPasswordResetEmail(user.email, token);
			} catch {
				return fail(500, {
					error: 'Gagal mengirim email. Cek konfigurasi SMTP.',
					email
				});
			}
		}

		return { success: true, email };
	}
};