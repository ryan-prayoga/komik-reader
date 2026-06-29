import { browser } from '$app/environment';

const STORAGE_KEY = 'komik-reader-prefs';

export type Theme = 'dark' | 'light' | 'system';

type StoredPrefs = {
	showNsfw: boolean;
	theme: Theme;
	sidebarCollapsed: boolean;
};

const DEFAULTS: StoredPrefs = {
	showNsfw: false,
	theme: 'system',
	sidebarCollapsed: false
};

function load(): StoredPrefs {
	if (!browser) return { ...DEFAULTS };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
	} catch {
		/* ignore */
	}
	return { ...DEFAULTS };
}

function prefersDark(): boolean {
	return browser && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

class PreferencesState {
	#initial = load();
	showNsfw = $state(this.#initial.showNsfw);
	theme = $state<Theme>(this.#initial.theme);
	sidebarCollapsed = $state(this.#initial.sidebarCollapsed);

	#save() {
		if (browser) {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					showNsfw: this.showNsfw,
					theme: this.theme,
					sidebarCollapsed: this.sidebarCollapsed
				})
			);
		}
	}

	setShowNsfw(value: boolean) {
		this.showNsfw = value;
		this.#save();
	}

	setTheme(value: Theme) {
		this.theme = value;
		this.#save();
		this.applyTheme();
	}

	toggleTheme() {
		// Resolve the effective theme, flip to the opposite explicit value.
		this.setTheme(this.resolved === 'dark' ? 'light' : 'dark');
	}

	setSidebarCollapsed(value: boolean) {
		this.sidebarCollapsed = value;
		this.#save();
	}

	toggleSidebar() {
		this.setSidebarCollapsed(!this.sidebarCollapsed);
	}

	/** The concrete theme in effect ('dark' | 'light'), resolving 'system'. */
	get resolved(): 'dark' | 'light' {
		if (this.theme === 'system') return prefersDark() ? 'dark' : 'light';
		return this.theme;
	}

	applyTheme() {
		if (!browser) return;
		document.documentElement.classList.toggle('dark', this.resolved === 'dark');
	}

	/** Call once on app start: apply theme and react to OS changes while in 'system'. */
	init() {
		if (!browser) return;
		this.applyTheme();
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
			if (this.theme === 'system') this.applyTheme();
		});
	}

	get nsfwFilter(): boolean | null {
		return this.showNsfw ? null : false;
	}
}

export const preferences = new PreferencesState();
