import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authEnabled } from '$lib/server/env';
import { rateLimit } from '$lib/server/ratelimit';
import { getAllowRegistration } from '$lib/server/settings';
import { createSession, setSessionCookie } from '$lib/server/session';
import {
	createUser,
	findUserByEmail,
	findUserByUsername,
	getUserCount,
	normalizeEmail,
	validateEmail,
	validatePassword
} from '$lib/server/users';

export const load: PageServerLoad = async ({ locals }) => {
	if (!authEnabled()) redirect(303, '/');
	if (locals.user) redirect(303, '/');

	const canRegister = getUserCount() === 0 || getAllowRegistration();
	if (!canRegister) redirect(303, '/login');

	return { firstUser: getUserCount() === 0 };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const canRegister = getUserCount() === 0 || getAllowRegistration();
		if (!canRegister) return fail(403, { error: 'Registrasi ditutup', email: '', username: '' });

		const limit = rateLimit(`register:${getClientAddress()}`, 5, 60 * 60_000);
		if (!limit.ok) {
			return fail(429, {
				error: `Terlalu banyak percobaan. Coba lagi dalam ${limit.retryAfter} detik.`,
				email: '',
				username: ''
			});
		}

		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');

		if (!email || !username || !password) {
			return fail(400, { error: 'Semua field wajib diisi', email, username });
		}
		if (!validateEmail(email)) {
			return fail(400, { error: 'Format email tidak valid', email, username });
		}
		if (username.length < 3) {
			return fail(400, { error: 'Username minimal 3 karakter', email, username });
		}
		const passErr = validatePassword(password);
		if (passErr) return fail(400, { error: passErr, email, username });
		if (password !== confirm) {
			return fail(400, { error: 'Konfirmasi password tidak cocok', email, username });
		}
		if (findUserByEmail(email)) {
			return fail(409, { error: 'Email sudah terdaftar', email, username });
		}
		if (findUserByUsername(username)) {
			return fail(409, { error: 'Username sudah dipakai', email, username });
		}

			// isAdmin decided atomically inside createUser (first row wins).
			let user;
			try {
				user = createUser(email, username, password, false);
			} catch {
				// UNIQUE email/username race with a concurrent register.
				return fail(409, { error: 'Email atau username sudah dipakai', email, username });
			}
			const token = createSession(user.id);
			setSessionCookie(cookies, token);
			redirect(303, '/');
		}
	};