import { describe, it, expect } from 'vitest';
import { isPublicPath, isSuwayomiApiPath } from './guard';

describe('isPublicPath', () => {
	it('allows auth pages and static prefixes', () => {
		for (const p of ['/login', '/register', '/forgot-password', '/reset-password', '/health']) {
			expect(isPublicPath(p)).toBe(true);
		}
		expect(isPublicPath('/_app/immutable/x.js')).toBe(true);
		expect(isPublicPath('/manifest.webmanifest')).toBe(true);
	});

	it('does NOT treat app pages as public', () => {
		for (const p of ['/', '/library', '/settings', '/manga/1']) {
			expect(isPublicPath(p)).toBe(false);
		}
	});

	it('keeps admin routes private (privilege-escalation guard)', () => {
		expect(isPublicPath('/admin')).toBe(false);
		expect(isPublicPath('/admin/users')).toBe(false);
		expect(isPublicPath('/admin/server')).toBe(false);
	});

	it('is not fooled by lookalike prefixes', () => {
		expect(isPublicPath('/loginx')).toBe(false);
		expect(isPublicPath('/registered')).toBe(false);
	});
});

describe('isSuwayomiApiPath', () => {
	it('matches proxied Suwayomi endpoints', () => {
		expect(isSuwayomiApiPath('/api/graphql')).toBe(true);
		expect(isSuwayomiApiPath('/api/v1/manga/1')).toBe(true);
	});

	it('excludes local auth API', () => {
		expect(isSuwayomiApiPath('/api/auth')).toBe(false);
		expect(isSuwayomiApiPath('/api/auth/login')).toBe(false);
	});

	it('ignores non-api paths', () => {
		expect(isSuwayomiApiPath('/library')).toBe(false);
	});
});
