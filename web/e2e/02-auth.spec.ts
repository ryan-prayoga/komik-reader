import { test, expect } from '@playwright/test';
import { ADMIN, loginAsAdmin, guestGraphql } from './helpers';

test.describe('Auth flows', () => {
	test('login gagal: password salah', async ({ page }) => {
		const api = await page.request.post('/login', {
			form: {
				login: ADMIN.login,
				password: 'definitely-wrong-password',
				redirectTo: '/'
			}
		});
		const body = await api.text();
		expect(body).toMatch(/salah|failure|401/i);

		await page.goto('/login');
		await page.waitForLoadState('networkidle');
		await page.locator('#login-identifier').fill(ADMIN.login);
		await page.locator('#login-password').fill('definitely-wrong-password');
		await page.locator('form button[type="submit"]').click();
		await expect(page.locator('#login-error')).toBeVisible({ timeout: 15_000 });
		await expect(page.locator('#login-error')).toContainText(/salah/i);
		await expect(page).toHaveURL(/\/login/);
	});

	test('login gagal: field kosong diblok HTML required', async ({ page }) => {
		await page.goto('/login');
		await page.locator('form button[type="submit"]').click();
		await expect(page).toHaveURL(/\/login/);
	});

	test('login sukses + session cookie + logout', async ({ page, context }) => {
		await loginAsAdmin(page);
		const cookies = await context.cookies();
		const session = cookies.find((c) => c.name === 'komik_session');
		expect(session, 'komik_session cookie').toBeTruthy();
		expect(session!.httpOnly).toBe(true);

		await expect(page.getByText(new RegExp(ADMIN.login, 'i')).first()).toBeVisible({
			timeout: 10_000
		});

		const logout = page.locator('form[action="/logout"] button').first();
		if (await logout.isVisible()) {
			await logout.click();
			await page.waitForTimeout(1000);
			const after = await context.cookies();
			const still = after.find((c) => c.name === 'komik_session' && c.value);
			expect(still?.value ?? '').not.toBe(session!.value);
		}
	});

	test('redirectTo open redirect blocked (//evil)', async ({ page }) => {
		const res = await page.request.post('/login', {
			form: {
				login: ADMIN.login,
				password: ADMIN.password,
				redirectTo: '//evil.example'
			}
		});
		const text = await res.text();
		expect(text).not.toContain('evil.example');
		// safeRedirect forces /
		expect(text).toMatch(/"location":"\/"/);
	});

	test('redirectTo path relatif aman', async ({ page }) => {
		const res = await page.request.post('/login', {
			form: {
				login: ADMIN.login,
				password: ADMIN.password,
				redirectTo: '/settings'
			}
		});
		const text = await res.text();
		expect(text).toMatch(/\/settings/);
		await page.goto('/settings');
		await expect(page).toHaveURL(/\/settings/);
	});

	test('forgot-password page renders', async ({ page }) => {
		await page.goto('/forgot-password');
		await expect(page.getByRole('heading', { name: /lupa|reset|password/i })).toBeVisible();
	});

	test('reset-password tanpa token tidak crash', async ({ page }) => {
		const res = await page.goto('/reset-password');
		expect(res?.status()).toBeLessThan(500);
		await expect(page.locator('body')).not.toBeEmpty();
	});
});

test.describe('Guest GraphQL security', () => {
	test('guest query sources OK', async ({ request }) => {
		const res = await guestGraphql(request, '{ sources { nodes { id name } } }');
		expect(res.status()).toBe(200);
		const json = await res.json();
		expect(json.data?.sources?.nodes?.length).toBeGreaterThan(0);
	});

	test('guest write mutation harus 401 (hooks gate) — fail jika Vite proxy bypass', async ({
		request
	}) => {
		const res = await request.post('/api/graphql', {
			data: {
				query: `mutation {
          updateExtension(input: { id: "x", patch: { install: true } }) {
            extension { pkgName }
          }
        }`
			},
			headers: { 'content-type': 'application/json' }
		});
		const server = res.headers()['server'] || '';
		const status = res.status();
		const body = await res.text();

		if (/jetty/i.test(server) && status !== 401) {
			throw new Error(
				`SEC: Vite proxy bypasses hooks.server guest GraphQL gate ` +
					`(server=${server}, status=${status}, body=${body.slice(0, 120)}). ` +
					`Fix: bypass /api/graphql to SvelteKit in vite.config.ts so hooks enforce isGuestAllowedGraphql.`
			);
		}

		expect(status, `expected 401 Login required, got ${status}: ${body}`).toBe(401);
		expect(body).toMatch(/login|unauthorized|required/i);
	});

	test('guest fetchSourceManga diizinkan (read-oriented) bila lewat hooks', async ({ request }) => {
		const res = await guestGraphql(
			request,
			`mutation {
        fetchSourceManga(input: { source: "0", type: POPULAR, page: 1 }) {
          mangas { id title }
          hasNextPage
        }
      }`
		);
		expect([200, 400, 500, 504]).toContain(res.status());
	});
});

test.describe('Admin authorization', () => {
	test('POST admin action tanpa session diblok hooks', async ({ request }) => {
		const res = await request.post('/admin/users?/create', {
			form: {
				email: 'hacker@example.com',
				username: 'hacker',
				password: 'password123'
			},
			maxRedirects: 0
		});
		expect([303, 302, 401, 403, 200]).toContain(res.status());
		if (res.status() === 200) {
			const text = await res.text();
			expect(text).not.toMatch(/Akun berhasil dibuat/i);
		}
	});
});
