import { browser } from '$app/environment';

const STORAGE_KEY = 'komik-reader-reader';

export type ReaderMode = 'webtoon' | 'paged' | 'double';
export type ReaderFit = 'width' | 'height' | 'original';
export type ReaderBg = 'black' | 'gray' | 'white';

type StoredReader = {
	mode: ReaderMode;
	fit: ReaderFit;
	zoom: number; // 0.5 – 2
	brightness: number; // 0.2 – 1 (1 = full)
	bg: ReaderBg;
	gap: boolean; // webtoon page gap
	autoScrollSpeed: number; // px per frame @ 60fps
};

const DEFAULTS: StoredReader = {
	mode: 'webtoon',
	fit: 'width',
	zoom: 1,
	brightness: 1,
	bg: 'black',
	gap: false,
	autoScrollSpeed: 2
};

function load(): StoredReader {
	if (!browser) return { ...DEFAULTS };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
	} catch {
		/* ignore */
	}
	return { ...DEFAULTS };
}

export const BG_CLASS: Record<ReaderBg, string> = {
	black: 'bg-black',
	gray: 'bg-neutral-800',
	white: 'bg-white'
};

class ReaderSettingsState {
	#initial = load();
	mode = $state<ReaderMode>(this.#initial.mode);
	fit = $state<ReaderFit>(this.#initial.fit);
	zoom = $state(this.#initial.zoom);
	brightness = $state(this.#initial.brightness);
	bg = $state<ReaderBg>(this.#initial.bg);
	gap = $state(this.#initial.gap);
	autoScrollSpeed = $state(this.#initial.autoScrollSpeed);

	#save() {
		if (!browser) return;
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				mode: this.mode,
				fit: this.fit,
				zoom: this.zoom,
				brightness: this.brightness,
				bg: this.bg,
				gap: this.gap,
				autoScrollSpeed: this.autoScrollSpeed
			})
		);
	}

	set<K extends keyof StoredReader>(key: K, value: StoredReader[K]) {
		(this as unknown as StoredReader)[key] = value;
		this.#save();
	}
}

export const readerSettings = new ReaderSettingsState();
