/** Relative time for detail rows (history, downloads) — verbose Indonesian, falls back to a full date after a week. */
export function relativeTime(ts: number): string {
	if (!ts) return '';
	const diff = Date.now() - ts;
	const mins = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);
	if (mins < 1) return 'Baru saja';
	if (mins < 60) return `${mins} menit lalu`;
	if (hours < 24) return `${hours} jam lalu`;
	if (days < 7) return `${days} hari lalu`;
	return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Compact relative time for tight card layouts. Accepts a raw epoch as seconds or ms. */
export function relativeTimeShort(raw: string | number): string {
	if (!raw || raw === '0') return '';
	const ts = Number(raw);
	const date = ts > 1e10 ? new Date(ts) : new Date(ts * 1000);
	if (isNaN(date.getTime())) return '';
	const diff = Date.now() - date.getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 60) return `${mins}m lalu`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}j lalu`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}h lalu`;
	return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export function chapterLabel(num: number): string {
	return Number.isInteger(num) ? `Ch.${num}` : `Ch.${num.toFixed(1)}`;
}
