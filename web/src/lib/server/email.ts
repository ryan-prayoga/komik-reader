import nodemailer from 'nodemailer';
import { appOrigin, smtpConfig, smtpConfigured } from './env';

export function canSendEmail(): boolean {
	return smtpConfigured();
}

export async function sendPasswordResetEmail(to: string, token: string) {
	if (!smtpConfigured()) {
		throw new Error('SMTP belum dikonfigurasi');
	}

	const cfg = smtpConfig();
	const resetUrl = `${appOrigin()}/reset-password?token=${encodeURIComponent(token)}`;

	const transporter = nodemailer.createTransport({
		host: cfg.host,
		port: cfg.port,
		secure: cfg.secure,
		auth: { user: cfg.user, pass: cfg.pass }
	});

	await transporter.sendMail({
		from: cfg.from,
		to,
		subject: 'Reset password — Komik Reader',
		text: `Kamu meminta reset password.\n\nBuka link ini (berlaku 1 jam):\n${resetUrl}\n\nAbaikan email ini jika kamu tidak meminta reset.`,
		html: `
			<p>Kamu meminta reset password untuk <strong>Komik Reader</strong>.</p>
			<p><a href="${resetUrl}">Reset password</a> (berlaku 1 jam)</p>
			<p style="color:#666;font-size:12px">Abaikan email ini jika kamu tidak meminta reset.</p>
		`
	});
}