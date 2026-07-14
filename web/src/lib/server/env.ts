import { env } from '$env/dynamic/private';

export function authEnabled(): boolean {
	return env.AUTH_ENABLED !== 'false';
}

/**
 * Optional-auth mode: when true, guests may browse/read without logging in.
 * Server-side write mutations still require a session. Local-first features
 * (library/history in client storage, /downloads offline chapters) stay
 * guest-accessible. Default ON; disable with AUTH_ALLOW_GUEST=false to force
 * login on every page.
 */
export function allowGuest(): boolean {
	return authEnabled() && env.AUTH_ALLOW_GUEST !== 'false';
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

export function smtpConfig() {
	return {
		host: env.SMTP_HOST || '',
		port: Number(env.SMTP_PORT || 587),
		secure: env.SMTP_SECURE === 'true',
		user: env.SMTP_USER || '',
		pass: env.SMTP_PASS || '',
		from: env.SMTP_FROM || env.SMTP_USER || 'noreply@komik-reader.local'
	};
}

export function smtpConfigured(): boolean {
	const cfg = smtpConfig();
	return Boolean(cfg.host && cfg.user && cfg.pass);
}

export function bootstrapAdmin() {
	return {
		email: env.ADMIN_EMAIL?.trim().toLowerCase() || '',
		password: env.ADMIN_PASSWORD || '',
		username: env.ADMIN_USERNAME?.trim() || 'admin'
	};
}