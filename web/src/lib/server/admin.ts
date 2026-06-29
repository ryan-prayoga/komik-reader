import { redirect } from '@sveltejs/kit';
import type { SessionUser } from './session';

export function requireAdmin(user: SessionUser | null): asserts user is SessionUser & { is_admin: true } {
	if (!user?.is_admin) redirect(303, '/');
}

export function isAdmin(user: SessionUser | null): boolean {
	return Boolean(user?.is_admin);
}