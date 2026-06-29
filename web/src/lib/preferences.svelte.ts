import { browser } from '$app/environment';

const STORAGE_KEY = 'komik-reader-prefs';

type StoredPrefs = {
	showNsfw: boolean;
};

function load(): StoredPrefs {
	if (!browser) return { showNsfw: false };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return { showNsfw: false, ...JSON.parse(raw) };
	} catch {
		/* ignore */
	}
	return { showNsfw: false };
}

function save(prefs: StoredPrefs) {
	if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

class PreferencesState {
	showNsfw = $state(load().showNsfw);

	setShowNsfw(value: boolean) {
		this.showNsfw = value;
		save({ showNsfw: value });
	}

	get nsfwFilter(): boolean | null {
		return this.showNsfw ? null : false;
	}
}

export const preferences = new PreferencesState();