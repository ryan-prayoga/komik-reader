import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authEnabled } from '$lib/server/env';
import { rateLimit } from '$lib/server/ratelimit';
import { getAllowRegistration } from '$lib/server/settings';
import { createSession, setSessionCookie } from '$lib/server/session';
import { getUserCount, verifyUserLogin } from '$lib/server/users';

function safeRedirect(path: string | null): string {
	if (!path || !path.startsWith('/') || path.startsWith('//')) return '/';
	if (path.startsWith('/login') || path.startsWith('/register')) return '/';
	return path;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!authEnabled()) redirect(303, '/');
	if (locals.user) redirect(303, safeRedirect(url.searchParams.get('redirectTo')));

	const canRegister = getUserCount() === 0 || getAllowRegistration();
	return {
		redirectTo: safeRedirect(url.searchParams.get('redirectTo')),
		canRegister
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const login = String(form.get('login') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const redirectTo = safeRedirect(
			String(form.get('redirectTo') ?? url.searchParams.get('redirectTo') ?? '/')
		);

		const limit = rateLimit(`login:${getClientAddress()}`, 10, 15 * 60_000);
		if (!limit.ok) {
			return fail(429, {
				error: `Terlalu banyak percobaan. Coba lagi dalam ${limit.retryAfter} detik.`,
				login,
				redirectTo
			});
		}

		if (!login || !password) {
			return fail(400, { error: 'Email/username dan password wajib diisi', login, redirectTo });
		}

		const user = verifyUserLogin(login, password);
		if (!user) {
			return fail(401, { error: 'Email/username atau password salah', login, redirectTo });
		}

		const token = createSession(user.id);
		setSessionCookie(cookies, token);
		redirect(303, redirectTo);
	}
};