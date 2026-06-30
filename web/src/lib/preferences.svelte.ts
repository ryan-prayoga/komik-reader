import { browser } from '$app/environment';

const STORAGE_KEY = 'komik-reader-prefs';

export type Theme = 'dark' | 'light' | 'system';

type StoredPrefs = {
	showNsfw: boolean;
	theme: Theme;
	sidebarCollapsed: boolean;
	activePkgNames: string[];
	extFilterLangs: string[];
	extFilterStatus: string;
	extFilterOnlyActive: boolean;
};

const DEFAULTS: StoredPrefs = {
	showNsfw: false,
	theme: 'system',
	sidebarCollapsed: false,
	activePkgNames: [],
	extFilterLangs: [],
	extFilterStatus: 'all',
	extFilterOnlyActive: false
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
	activePkgNames = $state<string[]>(this.#initial.activePkgNames);
	extFilterLangs = $state<string[]>(this.#initial.extFilterLangs);
	extFilterStatus = $state(this.#initial.extFilterStatus);
	extFilterOnlyActive = $state(this.#initial.extFilterOnlyActive);

	#save() {
		if (browser) {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					showNsfw: this.showNsfw,
					theme: this.theme,
					sidebarCollapsed: this.sidebarCollapsed,
					activePkgNames: this.activePkgNames,
					extFilterLangs: this.extFilterLangs,
					extFilterStatus: this.extFilterStatus,
					extFilterOnlyActive: this.extFilterOnlyActive
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

	activateExtension(pkgName: string) {
		if (!this.activePkgNames.includes(pkgName)) {
			this.activePkgNames = [...this.activePkgNames, pkgName];
			this.#save();
		}
	}

	deactivateExtension(pkgName: string) {
		this.activePkgNames = this.activePkgNames.filter((p) => p !== pkgName);
		this.#save();
	}

	isExtensionActive(pkgName: string): boolean {
		return this.activePkgNames.includes(pkgName);
	}

	setExtFilterLangs(langs: string[]) {
		this.extFilterLangs = langs;
		this.#save();
	}

	setExtFilterStatus(status: string) {
		this.extFilterStatus = status;
		this.#save();
	}

	setExtFilterOnlyActive(value: boolean) {
		this.extFilterOnlyActive = value;
		this.#save();
	}

	get nsfwFilter(): boolean | null {
		return this.showNsfw ? null : false;
	}
}

export const preferences = new PreferencesState();
