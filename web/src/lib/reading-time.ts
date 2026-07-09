// Reading-time tracker.
//
// Accumulates per-device reading duration in `timeSpentMs`. That raw field stays
// device-local, but the sync engine mirrors it into per-device `readtime` rows so
// the Stats page can sum time across a user's devices without any device's
// last-write clobbering another's total (see `web/src/lib/local/sync.svelte.ts`).
//
// The module exposes:
//   • `readingTimer`  — singleton timer with idle + visibility guards.
//   • `formatDuration` — ms → "1j 23m" / "45m" / "30d".
//   • `getMangaStats` / `getGlobalStats` — pure aggregations over history rows.
//
// The timer runs in the browser only; SSR calls into module-level state are
// guarded via `typeof document !== 'undefined'`.

import { localData } from './local/data.svelte';
import type { LocalHistory } from './local/types';
// Re-declare just the method shape we need so we don't depend on the full
// `LocalData` class type (avoids circular type resolution between the runes
// `$state` fields in `data.svelte.ts` and this module).
type DataWriter = { addTimeSpent(chapterId: number, deltaMs: number): Promise<void> };
const writer: DataWriter = localData;

const IDLE_MS = 5 * 60_000; // stop counting after 5 minutes of no interaction
const TICK_MS = 1_000;
// Drop a single interval if it's implausible (clock skew, sleep, DST). Two
// minutes is well past any reasonable UI delay and small enough to mask a real
// drag scroll resume.
const MAX_DELTA_MS = 2 * 60_000;

class ReadingTimer {
	/** Chapter id whose reading time is currently being accumulated. */
	#activeChapterId: number | null = null;
	/** Buffer (ms) not yet flushed to IndexedDB. */
	#bufferedMs = 0;
	/** Last tick timestamp (Date.now). Used to compute deltas. */
	#lastTickAt = 0;
	/** Last user-interaction timestamp (Date.now). */
	#lastActivityAt = 0;
	/** Whether the tab is currently visible (Page Visibility API). */
	#visible = true;
	// Browser setInterval returns number; Node typings say Timeout. This module
	// only runs in the browser (guarded via `typeof window`) so the union is fine
	// for tsc — at runtime only `number` ever lands here.
	#intervalId: number | ReturnType<typeof setInterval> | null = null;

	startChapter(chapterId: number) {
		if (typeof document === 'undefined') return;
		if (chapterId === this.#activeChapterId) {
			// Same chapter — just refresh the activity baseline.
			this.#lastActivityAt = Date.now();
			return;
		}
		// Commit the outgoing chapter first so its time doesn't leak into the new one.
		this.flush();
		this.#activeChapterId = chapterId;
		this.#bufferedMs = 0;
		const now = Date.now();
		this.#lastTickAt = now;
		this.#lastActivityAt = now;
		this.#ensureTicking();
	}

	/** Mark user as "currently interacting" — resets the idle cutoff. */
	pingActivity() {
		if (this.#activeChapterId === null) return;
		this.#lastActivityAt = Date.now();
	}

	/** Commit accumulated ms to IndexedDB. Returns the flushed amount. */
	async flush(): Promise<number> {
		if (this.#activeChapterId === null || this.#bufferedMs === 0) return 0;
		const chapterId = this.#activeChapterId;
		const delta = this.#bufferedMs;
		this.#bufferedMs = 0;
		try {
			await writer.addTimeSpent(chapterId, delta);
		} catch {
			// Restore the delta so we retry on the next flush instead of silently
			// dropping the user's time on a transient DB error.
			this.#bufferedMs += delta;
		}
		return delta;
	}

	/** Force-stop the timer (e.g. leaving the reader entirely). */
	async stop() {
		await this.flush();
		this.#activeChapterId = null;
		this.#bufferedMs = 0;
		this.#stopTicking();
	}

	#tick() {
		if (this.#activeChapterId === null) return;
		const now = Date.now();
		if (!this.#visible) {
			// Skip accumulation while hidden — just reset the baseline so the
			// first visible tick doesn't dump a huge delta.
			this.#lastTickAt = now;
			return;
		}
		if (now - this.#lastActivityAt > IDLE_MS) {
			// Idle — don't count, but keep the baseline fresh so the next active
			// tick doesn't dump the idle gap.
			this.#lastTickAt = now;
			return;
		}
		const delta = now - this.#lastTickAt;
		if (delta <= 0 || delta > MAX_DELTA_MS) {
			// Clock went backwards, sleep-resume, or DST — discard.
			this.#lastTickAt = now;
			return;
		}
		this.#bufferedMs += delta;
		this.#lastTickAt = now;
	}

	#ensureTicking() {
		if (this.#intervalId !== null) return;
		if (typeof window === 'undefined') return;
		this.#intervalId = window.setInterval(() => this.#tick(), TICK_MS);
		if (typeof document !== 'undefined' && !this.#wired) {
			document.addEventListener('visibilitychange', this.#onVisibility);
			window.addEventListener('pagehide', this.#onPageHide);
			this.#wired = true;
		}
	}

	#stopTicking() {
		if (this.#intervalId !== null) {
			clearInterval(this.#intervalId);
			this.#intervalId = null;
		}
	}

	#wired = false;
	#onVisibility = () => {
		if (typeof document === 'undefined') return;
		this.#visible = document.visibilityState === 'visible';
		if (!this.#visible) {
			// Flush so we don't lose this batch when the OS suspends the tab.
			void this.flush();
		} else {
			// Coming back — reset baseline so hidden time isn't counted.
			this.#lastTickAt = Date.now();
			this.#lastActivityAt = Date.now();
		}
	};
	#onPageHide = () => {
		// Best-effort: pagehide is the modern form of beforeunload. We can't
		// await IndexedDB inside this event reliably, but the next launch will
		// see the bufferedMs reflected in liveMs via the same flush path.
		void this.flush();
	};
}

export const readingTimer = new ReadingTimer();

// ── Aggregations ───────────────────────────────────────────────────────────

export type MangaStats = {
	mangaId: number;
	mangaTitle: string;
	thumbnailUrl: string | null;
	totalMs: number;
	chapterCount: number;
	lastReadAt: number;
};

export type GlobalStats = {
	totalMs: number;
	chapterCount: number;
	mangaCount: number;
	/** ms of time counted across chapters that are also marked as read. */
	completedMs: number;
};

export type DailyStat = {
	/** YYYY-MM-DD local */
	key: string;
	/** Short weekday label, e.g. Sen */
	label: string;
	ms: number;
};

/**
 * Rough daily activity from history `updatedAt` + `timeSpentMs`.
 * Not a perfect session log — attributes each chapter's total time to the day
 * it was last touched — but enough for a 7-day sparkline on Stats.
 */
export function getDailyStats(
	rows: LocalHistory[],
	days = 7,
	extraMsByChapter?: Map<number, number>
): DailyStat[] {
	const dayMs = new Map<string, number>();
	for (const h of rows) {
		if (h.deleted) continue;
		const ms = (h.timeSpentMs ?? 0) + (extraMsByChapter?.get(h.chapterId) ?? 0);
		if (ms <= 0) continue;
		const d = new Date(h.updatedAt);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		dayMs.set(key, (dayMs.get(key) ?? 0) + ms);
	}

	const out: DailyStat[] = [];
	const now = new Date();
	const weekdays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		out.push({
			key,
			label: weekdays[d.getDay()] ?? '',
			ms: dayMs.get(key) ?? 0
		});
	}
	return out;
}

// `extraMsByChapter` adds reading time contributed by OTHER devices (from the
// account-synced `readtime` rows). Pass it to include cross-device totals; omit
// it (guests / logged out) for this-device-only stats.
export function getMangaStats(
	mangaId: number,
	rows: LocalHistory[],
	extraMsByChapter?: Map<number, number>
): MangaStats | null {
	const filtered = rows.filter((h) => h.mangaId === mangaId && !h.deleted);
	if (!filtered.length) return null;
	const totalMs = filtered.reduce(
		(acc, h) => acc + (h.timeSpentMs ?? 0) + (extraMsByChapter?.get(h.chapterId) ?? 0),
		0
	);
	const recent = filtered.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
	return {
		mangaId,
		mangaTitle: recent.mangaTitle,
		thumbnailUrl: recent.thumbnailUrl,
		totalMs,
		chapterCount: filtered.length,
		lastReadAt: recent.updatedAt
	};
}

export function getAllMangaStats(
	rows: LocalHistory[],
	extraMsByChapter?: Map<number, number>
): MangaStats[] {
	const byManga = new Map<number, LocalHistory[]>();
	for (const h of rows) {
		if (h.deleted) continue;
		const list = byManga.get(h.mangaId) ?? [];
		list.push(h);
		byManga.set(h.mangaId, list);
	}
	const out: MangaStats[] = [];
	for (const [mangaId, list] of byManga) {
		const totalMs = list.reduce(
			(acc, h) => acc + (h.timeSpentMs ?? 0) + (extraMsByChapter?.get(h.chapterId) ?? 0),
			0
		);
		const recent = list.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
		out.push({
			mangaId,
			mangaTitle: recent.mangaTitle,
			thumbnailUrl: recent.thumbnailUrl,
			totalMs,
			chapterCount: list.length,
			lastReadAt: recent.updatedAt
		});
	}
	return out.sort((a, b) => b.totalMs - a.totalMs);
}

export function getGlobalStats(
	rows: LocalHistory[],
	extraMsByChapter?: Map<number, number>
): GlobalStats {
	let totalMs = 0;
	let completedMs = 0;
	let chapterCount = 0;
	const mangaIds = new Set<number>();
	for (const h of rows) {
		if (h.deleted) continue;
		const ms = (h.timeSpentMs ?? 0) + (extraMsByChapter?.get(h.chapterId) ?? 0);
		totalMs += ms;
		if (h.isRead) completedMs += ms;
		chapterCount += 1;
		mangaIds.add(h.mangaId);
	}
	return { totalMs, chapterCount, mangaCount: mangaIds.size, completedMs };
}

// ── Formatting ─────────────────────────────────────────────────────────────

/**
 * Compact Indonesian label for a millisecond duration.
 *   < 1m  → "<1m"
 *   < 1h  → "23m"
 *   < 1d  → "2j 15m"
 *   < 30d → "3h 4j"   (hari, jam)
 *   else  → "120h"
 */
export function formatDuration(ms: number): string {
	if (!ms || ms < 60_000) return '<1m';
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const remMinutes = minutes % 60;
	if (hours < 24) return remMinutes ? `${hours}j ${remMinutes}m` : `${hours}j`;
	const days = Math.floor(hours / 24);
	const remHours = hours % 24;
	if (days < 30) return remHours ? `${days}h ${remHours}j` : `${days}h`;
	return `${days}h`;
}

/** Longer human label for the stats page header (e.g. "2 jam 15 menit"). */
export function formatDurationLong(ms: number): string {
	if (!ms || ms < 60_000) return 'kurang dari 1 menit';
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 60) return `${minutes} menit`;
	const hours = Math.floor(minutes / 60);
	const remMinutes = minutes % 60;
	if (hours < 24) return remMinutes ? `${hours} jam ${remMinutes} menit` : `${hours} jam`;
	const days = Math.floor(hours / 24);
	const remHours = hours % 24;
	if (days < 30) return remHours ? `${days} hari ${remHours} jam` : `${days} hari`;
	return `${days} hari`;
}