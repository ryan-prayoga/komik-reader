import { test, expect } from '@playwright/test';
import { collectPageErrors, loginAsAdmin } from './helpers';

const GUEST_OK = [
	'/',
	'/library',
	'/search',
	'/history',
	'/extensions',
	'/downloads',
	'/settings',
	'/stats',
	'/offline',
	'/login',
	'/forgot-password'
];

test.describe('Smoke: guest routes render', () => {
	for (const path of GUEST_OK) {
		test(`GET ${path} tidak 5xx / blank`, async ({ page }) => {
			const errors = await collectPageErrors(page);
			const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
			expect(res, `response for ${path}`).not.toBeNull();
			expect(res!.status(), `${path} status`).toBeLessThan(500);
			await expect(page.locator('body')).not.toBeEmpty();
			// no uncaught fatal pageerror with "is not defined" etc
			const fatal = errors.filter((e) => /is not defined|Cannot read|Hydration/i.test(e));
			expect(fatal, `pageerrors on ${path}: ${fatal.join(' | ')}`).toEqual([]);
		});
	}

	test('register: first-user sudah ada → redirect login atau tutup', async ({ page }) => {
		const res = await page.goto('/register', { waitUntil: 'networkidle' });
		// After seed, registration closed → redirect to /login
		expect(res?.status()).toBeLessThan(500);
		const url = page.url();
		expect(url).toMatch(/\/(login|register)/);
		if (url.includes('/register')) {
			// still open somehow — form should exist
			await expect(page.getByRole('button', { name: /daftar/i })).toBeVisible();
		} else {
			await expect(page.getByRole('button', { name: /^masuk$/i })).toBeVisible();
		}
	});

	test('admin routes guest → login redirect', async ({ page }) => {
		await page.goto('/admin/users');
		await expect(page).toHaveURL(/\/login/);
		await expect(page.url()).toContain('redirectTo');
	});

	test('admin routes non-admin would redirect / — login works', async ({ page }) => {
		await loginAsAdmin(page);
		await page.goto('/admin/users');
		await expect(page).toHaveURL(/\/admin\/users/);
		await expect(page.getByText(/buat akun|daftar akun/i).first()).toBeVisible();
	});
});

test.describe('Smoke: primary headings', () => {
	test('home shows Beranda', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: /beranda/i })).toBeVisible({ timeout: 20_000 });
	});

	test('library shows Koleksi', async ({ page }) => {
		await page.goto('/library');
		await expect(page.getByRole('heading', { name: /koleksi/i })).toBeVisible({ timeout: 15_000 });
	});

	test('search page interactive', async ({ page }) => {
		await page.goto('/search');
		await expect(page.getByRole('heading', { level: 1, name: /^cari$/i })).toBeVisible({
			timeout: 15_000
		});
	});

	test('history empty/list renders', async ({ page }) => {
		await page.goto('/history');
		await expect(page.getByRole('heading', { level: 1, name: /^riwayat$/i })).toBeVisible({
			timeout: 15_000
		});
	});

	test('settings renders reader prefs', async ({ page }) => {
		await page.goto('/settings');
		await expect(page.getByRole('heading', { name: /pengaturan/i })).toBeVisible({ timeout: 15_000 });
	});

	test('downloads page renders', async ({ page }) => {
		await page.goto('/downloads');
		await expect(page.getByRole('heading', { level: 1, name: /^unduhan$/i })).toBeVisible({
			timeout: 15_000
		});
	});

	test('stats page renders', async ({ page }) => {
		await page.goto('/stats');
		await expect(page.getByRole('heading', { level: 1, name: /statistik/i })).toBeVisible({
			timeout: 15_000
		});
	});

	test('extensions page loads catalog or empty', async ({ page }) => {
		await page.goto('/extensions');
		await expect(page.getByRole('heading', { name: /ekstensi/i })).toBeVisible({ timeout: 15_000 });
		// wait for loading to settle
		await page.waitForTimeout(1500);
		const body = await page.locator('body').innerText();
		expect(body.length).toBeGreaterThan(20);
	});
});
