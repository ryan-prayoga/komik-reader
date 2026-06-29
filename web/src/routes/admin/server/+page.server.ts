import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { canSendEmail } from '$lib/server/email';
import {
	getAllowRegistration,
	getSmtpSettingsForAdmin,
	saveSmtpSettings,
	setAllowRegistration
} from '$lib/server/settings';

export const load: PageServerLoad = async () => {
	const smtp = getSmtpSettingsForAdmin();
	return {
		allowRegistration: getAllowRegistration(),
		smtp,
		smtpReady: canSendEmail()
	};
};

export const actions: Actions = {
	auth: async ({ request }) => {
		const form = await request.formData();
		setAllowRegistration(form.get('allow_registration') === 'on');
		return { success: 'Pengaturan auth disimpan' };
	},

	smtp: async ({ request }) => {
		const form = await request.formData();
		const host = String(form.get('host') ?? '').trim();
		const port = Number(form.get('port') ?? 587);
		const user = String(form.get('user') ?? '').trim();
		const pass = String(form.get('pass') ?? '');
		const from = String(form.get('from') ?? '').trim();
		const secure = form.get('secure') === 'on';

		if (!host || !user) {
			return fail(400, { error: 'SMTP host dan user wajib diisi' });
		}
		if (port < 1 || port > 65535) {
			return fail(400, { error: 'Port SMTP tidak valid' });
		}

		const existing = getSmtpSettingsForAdmin();
		if (!pass && !existing.passConfigured) {
			return fail(400, { error: 'Password SMTP wajib diisi' });
		}

		saveSmtpSettings({ host, port, secure, user, pass, from });
		return { success: 'Pengaturan SMTP disimpan' };
	}
};