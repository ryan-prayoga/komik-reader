import { getDb, type UserRow } from './db';
import { hashPassword, verifyPassword } from './password';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function getUserCount(): number {
	const database = getDb();
	const row = database.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
	return row.c;
}

export function findUserByEmail(email: string): UserRow | null {
	const database = getDb();
	const row = database
		.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
		.get(normalizeEmail(email)) as UserRow | undefined;
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

export function createUser(email: string, username: string, password: string): UserRow {
	const database = getDb();
	const result = database
		.prepare('INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)')
		.run(normalizeEmail(email), username.trim(), hashPassword(password));
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