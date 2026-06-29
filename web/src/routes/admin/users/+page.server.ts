import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	createUser,
	deleteUser,
	deleteUserSessions,
	findUserByEmail,
	findUserById,
	findUserByUsername,
	getAdminCount,
	listUsers,
	setUserAdmin,
	updateUserPassword,
	validateEmail,
	validatePassword
} from '$lib/server/users';

export const load: PageServerLoad = async ({ locals }) => {
	return { users: listUsers(), currentUserId: locals.user!.id };
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const isAdmin = form.get('is_admin') === 'on';

		if (!email || !username || !password) {
			return fail(400, { error: 'Semua field wajib diisi' });
		}
		if (!validateEmail(email)) return fail(400, { error: 'Format email tidak valid' });
		if (username.length < 3) return fail(400, { error: 'Username minimal 3 karakter' });
		const passErr = validatePassword(password);
		if (passErr) return fail(400, { error: passErr });
		if (findUserByEmail(email)) return fail(409, { error: 'Email sudah terdaftar' });
		if (findUserByUsername(username)) return fail(409, { error: 'Username sudah dipakai' });

		createUser(email, username, password, isAdmin);
		return { success: 'Akun berhasil dibuat' };
	},

	resetPassword: async ({ request }) => {
		const form = await request.formData();
		const userId = Number(form.get('user_id'));
		const password = String(form.get('password') ?? '');

		if (!userId || !password) return fail(400, { error: 'Data tidak lengkap' });
		const passErr = validatePassword(password);
		if (passErr) return fail(400, { error: passErr });
		if (!findUserById(userId)) return fail(404, { error: 'User tidak ditemukan' });

		updateUserPassword(userId, password);
		deleteUserSessions(userId);
		return { success: 'Password berhasil diubah' };
	},

	toggleAdmin: async ({ locals, request }) => {
		const form = await request.formData();
		const userId = Number(form.get('user_id'));
		const makeAdmin = form.get('make_admin') === 'true';

		if (!userId) return fail(400, { error: 'User tidak valid' });
		if (userId === locals.user!.id && !makeAdmin) {
			return fail(400, { error: 'Tidak bisa mencabut admin dari akun sendiri' });
		}
		if (!findUserById(userId)) return fail(404, { error: 'User tidak ditemukan' });

		if (!makeAdmin && getAdminCount() <= 1) {
			const user = findUserById(userId);
			if (user?.is_admin) return fail(400, { error: 'Minimal harus ada satu admin' });
		}

		setUserAdmin(userId, makeAdmin);
		if (!makeAdmin) deleteUserSessions(userId);
		return { success: makeAdmin ? 'User dijadikan admin' : 'Hak admin dicabut' };
	},

	delete: async ({ locals, request }) => {
		const form = await request.formData();
		const userId = Number(form.get('user_id'));

		if (!userId) return fail(400, { error: 'User tidak valid' });
		if (userId === locals.user!.id) {
			return fail(400, { error: 'Tidak bisa menghapus akun sendiri' });
		}

		const user = findUserById(userId);
		if (!user) return fail(404, { error: 'User tidak ditemukan' });
		if (user.is_admin && getAdminCount() <= 1) {
			return fail(400, { error: 'Tidak bisa menghapus admin terakhir' });
		}

		deleteUser(userId);
		return { success: 'Akun dihapus' };
	}
};