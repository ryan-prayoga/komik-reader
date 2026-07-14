import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const ADMIN = {
	login: process.env.E2E_ADMIN_USER || 'e2eadmin',
	password: process.env.E2E_ADMIN_PASS || 'e2eAdminPass1',
	email: process.env.E2E_ADMIN_EMAIL || 'e2e-admin@example.com'
};

export async function loginAsAdmin(page: Page) {
	const res = await page.request.post('/login', {
		form: {
			login: ADMIN.login,
			password: ADMIN.password,
			redirectTo: '/'
		}
	});
	const body = await res.text();
	expect(res.ok(), `login POST failed: ${res.status()} ${body}`).toBeTruthy();
	if (body.includes('"type":"failure"')) {
		throw new Error(`login failure body: ${body}`);
	}
	await page.goto('/');
	await expect(page).not.toHaveURL(/\/login/);
}

export async function firstSourceId(request: APIRequestContext): Promise<string | null> {
	const res = await request.post('/api/graphql', {
		data: { query: '{ sources { nodes { id name } } }' }
	});
	if (!res.ok()) return null;
	const json = (await res.json()) as {
		data?: { sources?: { nodes?: { id: string; name: string }[] } };
	};
	const nodes = json.data?.sources?.nodes ?? [];
	const real = nodes.find((n) => n.id !== '0' && !/local/i.test(n.name));
	return real?.id ?? nodes[0]?.id ?? null;
}

export async function collectPageErrors(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (err) => errors.push(err.message));
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text());
	});
	return errors;
}

export async function guestGraphql(
	request: APIRequestContext,
	query: string,
	variables?: Record<string, unknown>
) {
	return request.post('/api/graphql', {
		data: { query, variables },
		headers: { 'content-type': 'application/json' }
	});
}
