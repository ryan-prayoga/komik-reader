import { createHash, randomBytes } from 'node:crypto';
import { getDb } from './db';
import { authSecret } from './env';

function hashToken(token: string): string {
	return createHash('sha256').update(`${token}:reset:${authSecret()}`).digest('hex');
}

function expiresAt(): string {
	const d = new Date();
	d.setHours(d.getHours() + 1);
	return d.toISOString();
}

export function createPasswordReset(userId: number): string {
	const token = randomBytes(32).toString('hex');
	const database = getDb();
	database
		.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
		.run(userId, hashToken(token), expiresAt());
	return token;
}

export function consumePasswordReset(token: string): number | null {
	const database = getDb();
	const row = database
		.prepare(
			`SELECT id, user_id FROM password_resets
			 WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`
		)
		.get(hashToken(token)) as { id: number; user_id: number } | undefined;

	if (!row) return null;

	database
		.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?")
		.run(row.id);

	return row.user_id;
}