import { env } from '$env/dynamic/private';
import { getDb } from './db';

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