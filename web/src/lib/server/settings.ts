import { env } from '$env/dynamic/private';
import { getDb } from './db';

export type SmtpSettings = {
	host: string;
	port: number;
	secure: boolean;
	user: string;
	pass: string;
	from: string;
};

export function getSetting(key: string): string | null {
	const database = getDb();
	const row = database
		.prepare('SELECT value FROM app_settings WHERE key = ?')
		.get(key) as { value: string } | undefined;
	return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
	const database = getDb();
	database
		.prepare(
			`INSERT INTO app_settings (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`
		)
		.run(key, value);
}

export function getAllowRegistration(): boolean {
	const stored = getSetting('allow_registration');
	if (stored !== null) return stored === 'true';
	return env.ALLOW_REGISTRATION === 'true';
}

export function setAllowRegistration(enabled: boolean) {
	setSetting('allow_registration', enabled ? 'true' : 'false');
}

export function getSmtpSettings(): SmtpSettings {
	return {
		host: getSetting('smtp_host') ?? env.SMTP_HOST ?? '',
		port: Number(getSetting('smtp_port') ?? env.SMTP_PORT ?? 587),
		secure: (getSetting('smtp_secure') ?? env.SMTP_SECURE) === 'true',
		user: getSetting('smtp_user') ?? env.SMTP_USER ?? '',
		pass: getSetting('smtp_pass') ?? env.SMTP_PASS ?? '',
		from: getSetting('smtp_from') ?? env.SMTP_FROM ?? env.SMTP_USER ?? 'noreply@komik-reader.local'
	};
}

export function getSmtpSettingsForAdmin(): SmtpSettings & { passConfigured: boolean } {
	const cfg = getSmtpSettings();
	return {
		...cfg,
		pass: '',
		passConfigured: Boolean(cfg.pass)
	};
}

export function saveSmtpSettings(input: {
	host: string;
	port: number;
	secure: boolean;
	user: string;
	pass: string;
	from: string;
}) {
	setSetting('smtp_host', input.host.trim());
	setSetting('smtp_port', String(input.port));
	setSetting('smtp_secure', input.secure ? 'true' : 'false');
	setSetting('smtp_user', input.user.trim());
	if (input.pass) setSetting('smtp_pass', input.pass);
	setSetting('smtp_from', input.from.trim());
}