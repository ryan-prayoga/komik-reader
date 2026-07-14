import { describe, it, expect } from 'vitest';
import {
	toSqliteDatetime,
	normalizeExpiresAt,
	isExpiresAtValid,
	isSqliteDatetime
} from './sqlite-datetime';

// Fixed string fixtures — no wall-clock, no fake timers.
const NOW = '2026-07-14 12:00:00';

describe('toSqliteDatetime', () => {
	it('formats UTC as YYYY-MM-DD HH:MM:SS without T/Z', () => {
		const d = new Date('2026-07-14T15:30:45.123Z');
		expect(toSqliteDatetime(d)).toBe('2026-07-14 15:30:45');
	});

	it('zero-pads single-digit month/day/hour/minute/second', () => {
		const d = new Date('2026-01-02T03:04:05.000Z');
		expect(toSqliteDatetime(d)).toBe('2026-01-02 03:04:05');
	});

	it('uses UTC fields (not local timezone)', () => {
		// Explicit UTC midnight — must stay 00:00:00 regardless of host TZ.
		const d = new Date(Date.UTC(2026, 6, 14, 0, 0, 0));
		expect(toSqliteDatetime(d)).toBe('2026-07-14 00:00:00');
	});
});

describe('normalizeExpiresAt', () => {
	it('converts ISO with T/Z to SQLite form', () => {
		expect(normalizeExpiresAt('2026-07-14T11:00:00.000Z')).toBe('2026-07-14 11:00:00');
	});

	it('leaves canonical SQLite datetime unchanged', () => {
		expect(normalizeExpiresAt('2026-07-14 13:00:00')).toBe('2026-07-14 13:00:00');
	});

	it('strips fractional seconds from space-format values', () => {
		expect(normalizeExpiresAt('2026-07-14 13:00:00.500')).toBe('2026-07-14 13:00:00');
	});
});

describe('isExpiresAtValid', () => {
	it('rejects same-day past SQLite expiry', () => {
		expect(isExpiresAtValid('2026-07-14 11:00:00', NOW)).toBe(false);
	});

	it('rejects same-day past ISO expiry (the lexical T bug)', () => {
		// Documents the bug: raw ISO past still sorts *after* space-format NOW.
		const pastIso = '2026-07-14T11:00:00.000Z';
		expect(pastIso > NOW).toBe(true);
		// Fix: after normalize, past is rejected.
		expect(isExpiresAtValid(pastIso, NOW)).toBe(false);
	});

	it('accepts same-day future SQLite expiry', () => {
		expect(isExpiresAtValid('2026-07-14 13:00:00', NOW)).toBe(true);
	});

	it('accepts same-day future ISO expiry', () => {
		expect(isExpiresAtValid('2026-07-14T13:00:00.000Z', NOW)).toBe(true);
	});

	it('rejects boundary equality (strict greater-than, matching SQL)', () => {
		expect(isExpiresAtValid(NOW, NOW)).toBe(false);
	});

	it('accepts multi-day future', () => {
		expect(isExpiresAtValid('2026-07-21 12:00:00', NOW)).toBe(true);
	});

	it('rejects multi-day past', () => {
		expect(isExpiresAtValid('2026-07-01 12:00:00', NOW)).toBe(false);
	});
});

describe('isSqliteDatetime', () => {
	it('accepts canonical form', () => {
		expect(isSqliteDatetime('2026-07-14 12:00:00')).toBe(true);
	});

	it('rejects ISO form', () => {
		expect(isSqliteDatetime('2026-07-14T12:00:00.000Z')).toBe(false);
	});
});
