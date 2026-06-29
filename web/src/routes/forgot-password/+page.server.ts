import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authEnabled } from '$lib/server/env';
import { canSendEmail, sendPasswordResetEmail } from '$lib/server/email';
import { rateLimit } from '$lib/server/ratelimit';
import { createPasswordReset } from '$lib/server/reset';
import { findUserByEmail, normalizeEmail, validateEmail } from '$lib/server/users';

export const load: PageServerLoad = async ({ locals }) => {
	if (!authEnabled()) redirect(303, '/');
	if (locals.user) redirect(303, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		if (!canSendEmail()) {
			return fail(503, {
				error: 'SMTP belum dikonfigurasi. Hubungi admin.',
				email: ''
			});
		}

		// Throttle to curb email bombing + account enumeration probing.
		const limit = rateLimit(`forgot:${getClientAddress()}`, 5, 60 * 60_000);
		if (!limit.ok) {
			return fail(429, {
				error: `Terlalu banyak permintaan. Coba lagi dalam ${limit.retryAfter} detik.`,
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