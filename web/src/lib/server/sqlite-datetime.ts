/**
 * Canonical SQLite UTC datetime helpers.
 *
 * SQLite `datetime('now')` emits `YYYY-MM-DD HH:MM:SS` (space, no T/Z).
 * Storing `Date.toISOString()` (`YYYY-MM-DDTHH:MM:SS.sssZ`) breaks lexical
 * compares: for the same calendar day, `T` (ASCII 84) > space (32), so a
 * *past* ISO expiry can still pass `expires_at > datetime('now')`.
 */

const SQLITE_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

/** Format a Date as UTC `YYYY-MM-DD HH:MM:SS` (no T/Z, no fractional seconds). */
export function toSqliteDatetime(d: Date): string {
	return (
		`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ` +
		`${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
	);
}

/**
 * Normalize a stored `expires_at` value to canonical SQLite UTC datetime.
 * ISO-8601 rows (containing `T`) are parsed and rewritten; already-canonical
 * values are returned as-is (fractional seconds stripped if present).
 */
export function normalizeExpiresAt(value: string): string {
	const trimmed = value.trim();
	if (trimmed.includes('T')) {
		const d = new Date(trimmed);
		if (Number.isNaN(d.getTime())) return trimmed;
		return toSqliteDatetime(d);
	}
	// "YYYY-MM-DD HH:MM:SS.sss" → drop fractional part for stable compare
	if (trimmed.length > 19 && trimmed[19] === '.') {
		return trimmed.slice(0, 19);
	}
	return trimmed;
}

/** True when `expiresAt` is strictly after `now` under SQLite-style lexical rules. */
export function isExpiresAtValid(expiresAt: string, now: Date | string): boolean {
	const exp = normalizeExpiresAt(expiresAt);
	const nowStr = typeof now === 'string' ? normalizeExpiresAt(now) : toSqliteDatetime(now);
	return exp > nowStr;
}

/** Whether a stored value already looks like canonical SQLite datetime. */
export function isSqliteDatetime(value: string): boolean {
	return SQLITE_DATETIME_RE.test(value.trim());
}
