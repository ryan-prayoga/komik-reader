import { browser } from '$app/environment';

const STORAGE_KEY = 'komik-reader-reader';
const MANGA_PREFS_KEY = 'komik-reader-manga-prefs';

export type ReaderMode = 'webtoon' | 'paged' | 'double';
export type ReaderFit = 'width' | 'height' | 'original';
export type ReaderBg = 'black' | 'gray' | 'white';
export type ReaderDirection = 'ltr' | 'rtl';

type StoredReader = {
	mode: ReaderMode;
	fit: ReaderFit;
	zoom: number; // 0.5 – 2
	brightness: number; // 0.2 – 1 (1 = full)
	bg: ReaderBg;
	gap: boolean; // webtoon page gap
	autoScrollSpeed: number; // px per frame @ 60fps
	direction: ReaderDirection; // paged/double swipe + tap direction (rtl = manga)
	doubleOffset: boolean; // double mode: show first page alone so spreads pair up
	/** Keep desktop chapter dock visible even when chrome is hidden. */
	pinDock: boolean;
	/** Scale pages slightly to hide white letterboxing/borders on scans. */
	cropBorders: boolean;
};

export type MangaReaderPrefs = {
	mode?: ReaderMode;
	direction?: ReaderDirection;
};

const DEFAULTS: StoredReader = {
	mode: 'webtoon',
	fit: 'width',
	zoom: 1,
	brightness: 1,
	bg: 'black',
	gap: false,
	autoScrollSpeed: 2,
	direction: 'ltr',
	doubleOffset: false,
	pinDock: false,
	cropBorders: false
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

function loadMangaPrefs(): Record<string, MangaReaderPrefs> {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(MANGA_PREFS_KEY);
		if (raw) return JSON.parse(raw) as Record<string, MangaReaderPrefs>;
	} catch {
		/* ignore */
	}
	return {};
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
	direction = $state<ReaderDirection>(this.#initial.direction);
	doubleOffset = $state(this.#initial.doubleOffset);
	pinDock = $state(this.#initial.pinDock);
	cropBorders = $state(this.#initial.cropBorders);
	/** Manga whose per-title prefs are currently applied (for remember-on-change). */
	#activeMangaId: number | null = null;

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
				autoScrollSpeed: this.autoScrollSpeed,
				direction: this.direction,
				doubleOffset: this.doubleOffset,
				pinDock: this.pinDock,
				cropBorders: this.cropBorders
			})
		);
	}

	set<K extends keyof StoredReader>(key: K, value: StoredReader[K]) {
		(this as unknown as StoredReader)[key] = value;
		this.#save();
		if (this.#activeMangaId != null && (key === 'mode' || key === 'direction')) {
			this.rememberForManga(this.#activeMangaId);
		}
	}

	/** Apply stored mode/direction for a series when opening the reader. */
	applyForManga(mangaId: number) {
		this.#activeMangaId = mangaId;
		const prefs = loadMangaPrefs()[String(mangaId)];
		if (!prefs) return;
		if (prefs.mode) this.mode = prefs.mode;
		if (prefs.direction) this.direction = prefs.direction;
		// Don't #save() globals here — only remember on explicit set().
	}

	rememberForManga(mangaId: number) {
		if (!browser) return;
		const map = loadMangaPrefs();
		map[String(mangaId)] = { mode: this.mode, direction: this.direction };
		// Cap growth — keep last ~200 manga keys.
		const keys = Object.keys(map);
		if (keys.length > 200) {
			for (const k of keys.slice(0, keys.length - 200)) delete map[k];
		}
		try {
			localStorage.setItem(MANGA_PREFS_KEY, JSON.stringify(map));
		} catch {
			/* ignore */
		}
	}

	clearActiveManga() {
		this.#activeMangaId = null;
	}
}

export const readerSettings = new ReaderSettingsState();
