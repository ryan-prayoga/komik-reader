import { env } from '$env/dynamic/private';

export function authEnabled(): boolean {
	return env.AUTH_ENABLED !== 'false';
}

export function authSecret(): string {
	const secret = env.AUTH_SECRET;
	if (!secret && authEnabled()) {
		throw new Error('AUTH_SECRET must be set when auth is enabled');
	}
	return secret || 'dev-insecure-secret-change-me';
}

export function appOrigin(): string {
	return env.ORIGIN || 'http://localhost:5173';
}

export function dbPath(): string {
	return env.AUTH_DB_PATH || './data/auth.db';
}

export function bootstrapAdmin() {
	return {
		email: env.ADMIN_EMAIL?.trim().toLowerCase() || '',
		password: env.ADMIN_PASSWORD || '',
		username: env.ADMIN_USERNAME?.trim() || 'admin'
	};
}