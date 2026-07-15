import { createHash, randomBytes } from 'node:crypto';
import { getDb } from './db';
import { authSecret } from './env';
import { toSqliteDatetime } from './sqlite-datetime';

function hashToken(token: string): string {
	return createHash('sha256').update(`${token}:reset:${authSecret()}`).digest('hex');
}

function expiresAt(): string {
	const d = new Date(Date.now() + 60 * 60 * 1000);
	return toSqliteDatetime(d);
}

	export function createPasswordReset(userId: number): string {
		const token = randomBytes(32).toString('hex');
		const database = getDb();
		const insert = database.prepare(
			'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
		);
		const revoke = database.prepare(
			"UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL"
		);
		const run = database.transaction(() => {
			// Invalidate prior unused tokens so only the latest email link works.
			revoke.run(userId);
			insert.run(userId, hashToken(token), expiresAt());
		});
		run();
		return token;
	}

	export function consumePasswordReset(token: string): number | null {
		const database = getDb();
		const tokenHash = hashToken(token);
		// Atomic claim: only one concurrent request can flip used_at.
		const claim = database.prepare(
			`UPDATE password_resets
			 SET used_at = datetime('now')
			 WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`
		);
		const get = database.prepare(
			`SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NOT NULL`
		);

		const result = claim.run(tokenHash);
		if (result.changes !== 1) return null;

		const row = get.get(tokenHash) as { user_id: number } | undefined;
		return row?.user_id ?? null;
	}