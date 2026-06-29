import { getDb, type UserRow } from './db';
import { hashPassword, verifyPassword } from './password';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PublicUser = {
	id: number;
	email: string;
	username: string;
	is_admin: boolean;
	created_at: string;
};

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function validateEmail(email: string): boolean {
	return EMAIL_RE.test(email);
}

export function validatePassword(password: string): string | null {
	if (password.length < 8) return 'Password minimal 8 karakter';
	return null;
}

export function toPublicUser(row: UserRow): PublicUser {
	return {
		id: row.id,
		email: row.email,
		username: row.username,
		is_admin: row.is_admin === 1,
		created_at: row.created_at
	};
}

export function getUserCount(): number {
	const database = getDb();
	const row = database.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
	return row.c;
}

export function getAdminCount(): number {
	const database = getDb();
	const row = database
		.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1')
		.get() as { c: number };
	return row.c;
}

export function listUsers(): PublicUser[] {
	const database = getDb();
	const rows = database
		.prepare('SELECT * FROM users ORDER BY created_at ASC')
		.all() as UserRow[];
	return rows.map(toPublicUser);
}

export function findUserById(id: number): UserRow | null {
	const database = getDb();
	const row = database.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
	return row ?? null;
}

export function findUserByEmail(email: string): UserRow | null {
	const database = getDb();
	const row = database
		.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
		.get(normalizeEmail(email)) as UserRow | undefined;
	return row ?? null;
}

export function findUserByUsername(username: string): UserRow | null {
	const database = getDb();
	const row = database
		.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
		.get(username.trim()) as UserRow | undefined;
	return row ?? null;
}

export function findUserByLogin(login: string): UserRow | null {
	const value = login.trim();
	const database = getDb();
	const row = database
		.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE')
		.get(normalizeEmail(value), value) as UserRow | undefined;
	return row ?? null;
}

export function createUser(
	email: string,
	username: string,
	password: string,
	isAdmin = false
): UserRow {
	const database = getDb();
	const result = database
		.prepare('INSERT INTO users (email, username, password_hash, is_admin) VALUES (?, ?, ?, ?)')
		.run(normalizeEmail(email), username.trim(), hashPassword(password), isAdmin ? 1 : 0);
	return database.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as UserRow;
}

export function verifyUserLogin(login: string, password: string): UserRow | null {
	const user = findUserByLogin(login);
	if (!user) return null;
	if (!verifyPassword(password, user.password_hash)) return null;
	return user;
}

export function updateUserPassword(userId: number, password: string) {
	const database = getDb();
	database
		.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
		.run(hashPassword(password), userId);
}

export function setUserAdmin(userId: number, isAdmin: boolean) {
	const database = getDb();
	database
		.prepare('UPDATE users SET is_admin = ? WHERE id = ?')
		.run(isAdmin ? 1 : 0, userId);
}

export function deleteUser(userId: number) {
	const database = getDb();
	database.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

export function deleteUserSessions(userId: number) {
	const database = getDb();
	database.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}