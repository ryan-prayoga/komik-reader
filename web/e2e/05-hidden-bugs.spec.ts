import { test, expect } from '@playwright/test';
import { ADMIN, loginAsAdmin, guestGraphql, firstSourceId } from './helpers';

test.describe('Hidden bugs: auth edge cases', () => {
	test('login already authenticated redirects away from /login', async ({ page }) => {
		await loginAsAdmin(page);
		await page.goto('/login');
		await expect(page).not.toHaveURL(/\/login$/);
	});

	test('double login form submit does not throw', async ({ page }) => {
		await page.goto('/login');
		await page.locator('input[name="login"]').fill(ADMIN.login);
		await page.locator('input[name="password"]').fill(ADMIN.password);
		const btn = page.locator('form button[type="submit"]');
		await Promise.all([btn.click(), btn.click().catch(() => {})]);
		await page.waitForTimeout(2000);
		expect(page.url()).toMatch(/127\.0\.0\.1|localhost/);
	});

	test('session cookie SameSite=Lax', async ({ page, context }) => {
		await loginAsAdmin(page);
		const c = (await context.cookies()).find((x) => x.name === 'komik_session');
		expect(c?.sameSite?.toLowerCase()).toMatch(/lax|strict/);
	});
});

test.describe('Hidden bugs: GraphQL proxy / Vite bypass', () => {
	test('detect whether /api/graphql hits Jetty (Vite) or SvelteKit hooks', async ({ request }) => {
		const res = await request.post('/api/graphql', {
			data: { query: '{ aboutServer { name } }' },
			headers: { 'content-type': 'application/json' }
		});
		const server = res.headers()['server'] || '';
		test.info().annotations.push({
			type: 'proxy-path',
			description: server
				? `GraphQL served by: ${server}`
				: 'GraphQL served without Server header (likely SvelteKit hooks)'
		});
		expect(res.status()).toBe(200);
	});

	test('guest write via aliased mutation — must 401 when hooks active', async ({ request }) => {
		const res = await guestGraphql(
			request,
			`mutation {
        x: updateExtension(input: { id: "x", patch: { install: true } }) {
          extension { pkgName }
        }
      }`
		);
		expect(res.status(), 'guest write must be 401 (Vite Jetty bypass = bug)').toBe(401);
	});

	test('comment smuggling write mutation denied when hooks active', async ({ request }) => {
		const res = await guestGraphql(
			request,
			`mutation {
        # fetchManga
        updateExtension(input: { id: "x", patch: { install: true } }) {
          extension { pkgName }
        }
      }`
		);
		expect(res.status(), 'comment smuggle must 401').toBe(401);
	});

	test('empty graphql body not accepted as guest write', async ({ request }) => {
		const res = await request.post('/api/graphql', {
			data: '',
			headers: { 'content-type': 'application/json' }
		});
		expect([400, 401, 415, 429, 500]).toContain(res.status());
	});

	test('batch array with one write mutation denied entirely when hooks active', async ({
		request
	}) => {
		const res = await request.post('/api/graphql', {
			data: [
				{ query: '{ sources { nodes { id } } }' },
				{
					query: `mutation {
            updateExtension(input: { id: "x", patch: { install: true } }) {
              extension { pkgName }
            }
          }`
				}
			],
			headers: { 'content-type': 'application/json' }
		});
		expect(res.status(), 'batch guest write must 401').toBe(401);
	});
});

test.describe('Hidden bugs: navigation races', () => {
	test('rapid primary nav switches no crash', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
		const paths = ['/library', '/search', '/history', '/', '/settings', '/downloads', '/stats'];
		for (const p of paths) {
			await page.goto(p, { waitUntil: 'domcontentloaded' });
		}
		await expect(page.locator('body')).not.toBeEmpty();
		const text = await page.locator('body').innerText();
		expect(text).not.toMatch(/application error|chunk load error/i);
	});

	test('browser back from browse to home', async ({ page, request }) => {
		const id = await firstSourceId(request);
		test.skip(!id, 'no source');
		await page.goto('/');
		await page.goto(`/browse/${id}`);
		await page.goBack();
		await expect(page).toHaveURL(/\/($|\?)/);
	});
});

test.describe('Hidden bugs: offline / health', () => {
	test('/health endpoint', async ({ request }) => {
		const res = await request.get('/health');
		expect([200, 204, 404]).toContain(res.status());
	});

	test('offline page loads', async ({ page }) => {
		await page.goto('/offline');
		await expect(page.locator('body')).toContainText(/offline|koneksi|jaringan|tidak/i);
	});
});

test.describe('Hidden bugs: admin self-protection', () => {
	test('admin users page lists self', async ({ page }) => {
		await loginAsAdmin(page);
		await page.goto('/admin/users');
		await expect(page.getByRole('heading', { name: /daftar akun/i })).toBeVisible({
			timeout: 15_000
		});
		await expect(page.getByText(/\(kamu\)/i).first()).toBeVisible();
		await expect(page.locator('body')).toContainText(ADMIN.login);
	});

	test('create user validation password min 8', async ({ page }) => {
		await loginAsAdmin(page);
		await page.goto('/admin/users');
		await page.locator('input[name="email"]').fill('short@example.com');
		await page.locator('input[name="username"]').fill('shorty');
		await page.locator('form[action="?/create"] input[name="password"]').fill('short');
		await page.getByRole('button', { name: /buat akun/i }).click();
		await page.waitForTimeout(1000);
		const body = await page.locator('body').innerText();
		expect(body).not.toMatch(/Akun berhasil dibuat/i);
	});
});

test.describe('Hidden bugs: guest activePkg empty', () => {
	test('guest home shows sources when activePkg list empty', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: /beranda/i })).toBeVisible();
		await expect
			.poll(async () => page.locator('a[href^="/browse/"]').count(), { timeout: 30_000 })
			.toBeGreaterThan(0);
	});
});

test.describe('Hidden bugs: reader chrome', () => {
	test('read page keyboard no crash when chapter available', async ({ page, request }) => {
		const sourceId = await firstSourceId(request);
		test.skip(!sourceId, 'no source');

		const res = await request.post('/api/graphql', {
			data: {
				query: `mutation($id: LongString!) {
          fetchSourceManga(input: { source: $id, type: POPULAR, page: 1 }) {
            mangas { id }
          }
        }`,
				variables: { id: sourceId }
			}
		});
		const json = await res.json();
		const mangaId = json?.data?.fetchSourceManga?.mangas?.[0]?.id as number | undefined;
		if (!mangaId) {
			test.skip(true, 'no manga from source');
			return;
		}

		await page.goto(`/manga/${mangaId}`);
		await page.waitForTimeout(4000);
		const ch = page.locator('a[href^="/read/"]').first();
		if (!(await ch.isVisible().catch(() => false))) {
			const fetchBtn = page.getByRole('button', { name: /muat|refresh|chapter|bab/i }).first();
			if (await fetchBtn.isVisible().catch(() => false)) {
				await fetchBtn.click();
				await page.waitForTimeout(5000);
			}
		}
		if (!(await ch.isVisible().catch(() => false))) {
			test.skip(true, 'no chapter link');
			return;
		}
		await ch.click();
		await expect(page).toHaveURL(/\/read\/\d+/);
		await page.waitForTimeout(4000);
		await page.keyboard.press('Escape');
		await page.keyboard.press(']');
		await page.keyboard.press('[');
		const text = await page.locator('body').innerText();
		expect(text).not.toMatch(/application error/i);
	});
});
