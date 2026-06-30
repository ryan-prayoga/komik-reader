const LANG_META: Record<string, { flag: string; name: string }> = {
	all: { flag: '🌐', name: 'Multi-bahasa' },
	id: { flag: '🇮🇩', name: 'Indonesia' },
	en: { flag: '🇬🇧', name: 'English' },
	ja: { flag: '🇯🇵', name: '日本語' },
	zh: { flag: '🇨🇳', name: '中文' },
	'zh-Hans': { flag: '🇨🇳', name: 'Mandarin Sederhana' },
	'zh-Hant': { flag: '🇹🇼', name: 'Mandarin Tradisional' },
	ko: { flag: '🇰🇷', name: '한국어' },
	ar: { flag: '🇸🇦', name: 'العربية' },
	de: { flag: '🇩🇪', name: 'Deutsch' },
	es: { flag: '🇪🇸', name: 'Español' },
	fr: { flag: '🇫🇷', name: 'Français' },
	it: { flag: '🇮🇹', name: 'Italiano' },
	pt: { flag: '🇵🇹', name: 'Português' },
	'pt-BR': { flag: '🇧🇷', name: 'Português (Brasil)' },
	ru: { flag: '🇷🇺', name: 'Русский' },
	tr: { flag: '🇹🇷', name: 'Türkçe' },
	pl: { flag: '🇵🇱', name: 'Polski' },
	vi: { flag: '🇻🇳', name: 'Tiếng Việt' },
	th: { flag: '🇹🇭', name: 'ภาษาไทย' },
	bg: { flag: '🇧🇬', name: 'Български' },
	ca: { flag: '🏳️', name: 'Català' },
	cs: { flag: '🇨🇿', name: 'Čeština' },
	nl: { flag: '🇳🇱', name: 'Nederlands' },
	ro: { flag: '🇷🇴', name: 'Română' },
	uk: { flag: '🇺🇦', name: 'Українська' },
	hu: { flag: '🇭🇺', name: 'Magyar' },
	ms: { flag: '🇲🇾', name: 'Bahasa Melayu' },
	fil: { flag: '🇵🇭', name: 'Filipino' }
};

export function langDisplay(code: string): string {
	const m = LANG_META[code];
	return m ? `${m.flag} ${m.name}` : code;
}
