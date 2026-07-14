import { test, expect } from '@playwright/test';
import { firstSourceId, loginAsAdmin, collectPageErrors } from './helpers';

test.describe('Browse → Manga → Read journey', () => {
	test('home lists installed sources for guest', async ({ page }) => {
		const errors = await collectPageErrors(page);
		await page.goto('/');
		await expect(page.getByRole('heading', { name: /beranda/i })).toBeVisible();
		await expect
			.poll(async () => page.locator('a[href^="/browse/"]').count(), { timeout: 30_000 })
			.toBeGreaterThan(0);
		const fatal = errors.filter((e) => /TypeError|ReferenceError|Hydration/i.test(e));
		expect(fatal, fatal.join('\n')).toEqual([]);
	});

	test('browse source popular list + open manga', async ({ page, request }) => {
		const sourceId = await firstSourceId(request);
		test.skip(!sourceId, 'no sources from Suwayomi');

		await page.goto(`/browse/${sourceId}`);
		// header / loading / list
		await expect(page.locator('body')).toContainText(/.+/);
		// wait for cards or empty/error
		await page.waitForTimeout(4000);
		const mangaLink = page.locator('a[href^="/manga/"]').first();
		const err = page.getByText(/gagal|error|tidak/i).first();
		const empty = page.getByText(/kosong|tidak ada/i).first();

		if (await mangaLink.isVisible().catch(() => false)) {
			const href = await mangaLink.getAttribute('href');
			expect(href).toMatch(/\/manga\/\d+/);
			await mangaLink.click();
			await expect(page).toHaveURL(/\/manga\/\d+/);
			// manga detail: title area + chapters or loading
			await page.waitForTimeout(3000);
			await expect(page.locator('body')).not.toBeEmpty();

			// try open first chapter if present
			const chapter = page.locator('a[href^="/read/"]').first();
			if (await chapter.isVisible().catch(() => false)) {
				await chapter.click();
				await expect(page).toHaveURL(/\/read\/\d+/);
				// reader chrome or pages loading
				await page.waitForTimeout(5000);
				const readerBody = await page.locator('body').innerText();
				expect(readerBody.length).toBeGreaterThan(5);
				// no hard crash banner
				expect(readerBody).not.toMatch(/application error|internal server error/i);
			}
		} else {
			// source may rate-limit; still must not 500
			await expect(err.or(empty).or(page.getByText(/memuat/i))).toBeVisible();
		}
	});

	test('search multi-source does not crash', async ({ page }) => {
		await page.goto('/search');
		const input = page.locator('input[type="search"]');
		await expect(input).toBeVisible({ timeout: 15_000 });
		await expect
			.poll(async () => page.locator('select option').count(), { timeout: 25_000 })
			.toBeGreaterThan(1);
		await input.fill('one piece');
		const btn = page.locator('form button[type="submit"]');
		await expect(btn).toBeEnabled({ timeout: 10_000 });
		await btn.click();
		await page.waitForTimeout(4000);
		const body = await page.locator('body').innerText();
		expect(body).not.toMatch(/application error|internal server error/i);
	});


	test('manga invalid id handles gracefully', async ({ page }) => {
		const res = await page.goto('/manga/999999999');
		expect(res?.status()).toBeLessThan(500);
		await page.waitForTimeout(2000);
		const body = await page.locator('body').innerText();
		expect(body).not.toMatch(/application error/i);
	});

	test('read invalid chapter handles gracefully', async ({ page }) => {
		const res = await page.goto('/read/999999999');
		expect(res?.status()).toBeLessThan(500);
		await page.waitForTimeout(3000);
		const body = await page.locator('body').innerText();
		expect(body).not.toMatch(/application error/i);
	});
});

test.describe('Logged-in library/extensions admin bits', () => {
	test('admin can open extensions + admin server', async ({ page }) => {
		await loginAsAdmin(page);
		await page.goto('/extensions');
		await expect(page.getByRole('heading', { name: /ekstensi/i })).toBeVisible();
		await page.waitForTimeout(2000);

		await page.goto('/admin/server');
		await expect(page.getByText(/auth|registrasi|suwayomi/i).first()).toBeVisible({ timeout: 15_000 });
	});

	test('library empty state guest-friendly', async ({ page }) => {
		await page.goto('/library');
		// fresh context → empty local library
		await expect(
			page.getByText(/kosong|belum|bookmark|koleksi/i).first()
		).toBeVisible({ timeout: 15_000 });
	});
});
