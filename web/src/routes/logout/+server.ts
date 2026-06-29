import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	clearSessionCookie,
	destroySession,
	readSessionToken
} from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = readSessionToken(cookies);
	destroySession(token);
	clearSessionCookie(cookies);
	redirect(303, '/login');
};