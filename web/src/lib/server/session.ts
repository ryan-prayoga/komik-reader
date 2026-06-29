import { createHash, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { getDb, type UserRow } from './db';
import { authSecret } from './env';

const COOKIE_NAME = 'komik_session';
const SESSION_DAYS = 7;

export type SessionUser = {
	id: number;
	email: string;
	username: string;
	is_admin: boolean;
};

function hashToken(token: string): string {
	return createHash('sha256').update(`${token}:${authSecret()}`).digest('hex');
}

function expiresAt(): string {
	const d = new Date();
	d.setDate(d.getDate() + SESSION_DAYS);
	return d.toISOString();
}

export function createSession(userId: number): string {
	const token = randomBytes(32).toString('hex');
	const database = getDb();
	database
		.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
		.run(userId, hashToken(token), expiresAt());
	return token;
}

export function destroySession(token: string | undefined) {
	if (!token) return;
	const database = getDb();
	database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function getUserFromSession(token: string | undefined): SessionUser | null {
	if (!token) return null;

	const database = getDb();
	const row = database
		.prepare(
			`SELECT u.id, u.email, u.username, u.is_admin
			 FROM sessions s
			 JOIN users u ON u.id = s.user_id
			 WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
		)
		.get(hashToken(token)) as { id: number; email: string; username: string; is_admin: number } | undefined;

	if (!row) return null;
	return {
		id: row.id,
		email: row.email,
		username: row.username,
		is_admin: row.is_admin === 1
	};
}

export function setSessionCookie(cookies: Cookies, token: string) {
	cookies.set(COOKIE_NAME, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: SESSION_DAYS * 24 * 60 * 60
	});
}

export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(COOKIE_NAME, { path: '/' });
}

export function readSessionToken(cookies: Cookies): string | undefined {
	return cookies.get(COOKIE_NAME);
}

export function toPublicUser(row: UserRow): SessionUser {
	return {
		id: row.id,
		email: row.email,
		username: row.username,
		is_admin: row.is_admin === 1
	};
}