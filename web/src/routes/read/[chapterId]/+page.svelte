<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { untrack, flushSync } from 'svelte';
	import { apiUrl } from '$lib/graphql/client';
	import { fetchChapterPages, getMangaChapters } from '$lib/graphql/api';
	import { queueChapterProgress } from '$lib/graphql/progress-queue';
	import { isOnline } from '$lib/offline/connection.svelte';
	import { cacheChapterToDevice, getCachedPageUrls } from '$lib/offline/cache';
	import { getOfflineChapter } from '$lib/offline/db';
	import { readerSettings, BG_CLASS } from '$lib/reader-settings.svelte';
	import { localData } from '$lib/local/data.svelte';
	import {
			clampResumeToFreshPageCount,
			resumePageFor,
			resumeProgressFor
		} from '$lib/reader/resume';
		import { isWebtoonChapterRead } from '$lib/reader/webtoon-progress';
	import { updates } from '$lib/updates/updates.svelte';
	import { readingTimer } from '$lib/reading-time';
	import WebtoonView from '$lib/components/reader/WebtoonView.svelte';
	import PagedView from '$lib/components/reader/PagedView.svelte';
	import ReaderControls from '$lib/components/reader/ReaderControls.svelte';
	import ReaderSettings from '$lib/components/reader/ReaderSettings.svelte';
	import ReaderCoach from '$lib/components/reader/ReaderCoach.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import type { Chapter } from '$lib/graphql/types';

	const chapterId = $derived(Number($page.params.chapterId));

	// Paged mode
	let pages = $state<string[]>([]);
	let currentPage = $state(0);
	let initialPage = $state(0);
	// Webtoon: scroll fraction within initialPage to land exactly where the
	// reader stopped, not at the top of a pages-tall panel.
	let initialPageProgress = $state(0);

	// Webtoon sections (each section = one chapter's pages)
	type Section = { chapter: Chapter; pages: string[] };
	let sections = $state<Section[]>([]);
	// Chapter id of the section currently in view (not an array index — sections
	// gets pruned from the front as the reader advances, see the prune effect below).
	let currentChapterId = $state(0);
	let currentPageIdx = $state(0);
	let currentPageProgress = $state(0); // 0–1 scroll progress within the current page
	let currentChapterProgress = $state(0); // 0–1 true scroll progress across the whole chapter
	let loadingNextChapter = $state(false);

	// Shared
	let chapters = $state<Chapter[]>([]);
	let current = $state<Chapter | null>(null);
	let mangaId = $state<number | null>(null);
	let mangaTitle = $state('');
	let mangaThumb = $state<string | null>(null);
	let mangaSourceId = $state<string | null>(null);
	let loading = $state(true);
	let error = $state('');
	let offlineMode = $state(false);
	let chromeVisible = $state(readerSettings.mode !== 'webtoon');
	let settingsOpen = $state(false);
	let autoScroll = $state(false);
	let autoScrollSpeed = $state(readerSettings.autoScrollSpeed);
	let nextChapterError = $state('');
	let chapterOffline = $state(false);
	let downloadProgress = $state<number | null>(null);
	let isFullscreen = $state(false);
	// The actual scroll surface for webtoon mode (position:fixed, self-scrolling —
	// see the effect below for why this replaced scrolling the document itself).
	let webtoonScrollEl = $state<HTMLDivElement | undefined>();

	// Keep the screen awake while reading (especially auto-scroll) so the panel
	// doesn't go black mid-chapter. Best-effort — ignored if unsupported/denied.
	$effect(() => {
		if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
		let lock: WakeLockSentinel | null = null;
		let cancelled = false;

		async function request() {
			try {
				lock = await navigator.wakeLock.request('screen');
				lock.addEventListener('release', () => {
					lock = null;
				});
			} catch {
				/* permission / battery saver — ignore */
			}
		}

		if (document.visibilityState === 'visible') void request();
		const onVis = () => {
			if (document.visibilityState === 'visible' && !lock && !cancelled) void request();
		};
		document.addEventListener('visibilitychange', onVis);

		return () => {
			cancelled = true;
			document.removeEventListener('visibilitychange', onVis);
			void lock?.release();
		};
	});

	$effect(() => {
		if (!autoScroll) return;
		let rafId: number;
		let lastTime: number | null = null;
		let remainder = 0;
		function step(time: number) {
			if (lastTime !== null) {
				// autoScrollSpeed is "px per frame @ 60fps" — convert to px/ms and scale
				// by actual elapsed time so speed stays constant regardless of refresh rate
				// or dropped frames. Remainder carries fractional px so scrollBy (integer-only)
				// never drops sub-pixel motion, keeping the motion visually smooth.
				const delta = ((autoScrollSpeed * 60) / 1000) * (time - lastTime) + remainder;
				const whole = Math.trunc(delta);
				remainder = delta - whole;
				const el = webtoonScrollEl;
				if (!el) {
					lastTime = time;
					rafId = requestAnimationFrame(step);
					return;
				}
				if (whole !== 0) el.scrollBy(0, whole);

					// Stop cleanly at end of content when there's nothing left to load,
					// or when the next-chapter fetch already failed (otherwise we'd
					// thrash against the error footer forever).
					const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
					if (
						atEnd &&
						!loadingNextChapter &&
						(!nextUnloadedChapter || nextChapterError)
					) {
						autoScroll = false;
						if (!nextChapterError) showToast('Sudah di akhir bacaan.', 'info');
						return;
					}
			}
			lastTime = time;
			rafId = requestAnimationFrame(step);
		}
		rafId = requestAnimationFrame(step);
		return () => cancelAnimationFrame(rafId);
	});

	$effect(() => {
		readerSettings.set('autoScrollSpeed', autoScrollSpeed);
	});

	// Webtoon mode advances through chapters via infinite scroll without ever
	// navigating, so the URL stays pinned to whichever chapter was first opened —
	// reloading the page (or reopening the tab) would jump back there instead of
	// wherever the user actually scrolled to. Sync the address bar with a silent
	// native history.replaceState (not SvelteKit's goto/replaceState, which would
	// re-run this component's load effect). Done inside reportWebtoonPage — as an
	// $effect this raced hard navs: it re-ran on the chapterId change while
	// currentChapterId was still the OLD chapter, replaceState-ing the fresh URL
	// straight back to the chapter just left.
	function syncUrlToChapter(id: number) {
		history.replaceState(history.state, '', `/read/${id}`);
	}

	// Because the sync above is a NATIVE replaceState, SvelteKit's
	// $page.params.chapterId stays pinned to the chapter that was first opened.
	// goto() back to that chapter is then a same-params no-op: the reset $effect
	// never reruns and the reader looks frozen until a manual reload. All chapter
	// navigation goes through here — a stale-param target forces the reset by
	// bumping navNonce (which the reset $effect and resetToken both track).
	let navNonce = $state(0);
	function navigateToChapter(id: number) {
		if (id === chapterId) {
			history.replaceState(history.state, '', `/read/${id}`);
			navNonce++;
		} else {
			void goto(`/read/${id}`);
		}
	}

	// Suwayomi page URLs can expire; same-URL retries never recover from that.
	// The views escalate here after repeated failures to swap in fresh URLs.
	async function refreshChapterPages(id: number) {
		if (!isOnline()) {
			showToast('Butuh koneksi untuk memuat ulang halaman.', 'error');
			throw new Error('offline');
		}
		const fresh = (await fetchChapterPages(id)).map((p) => apiUrl(p));
		sections = sections.map((s) => (s.chapter.id === id ? { ...s, pages: fresh } : s));
		if (id === chapterId) pages = fresh;
	}

	// Belt-and-suspenders: webtoon's real scroll surface is the fixed
	// `webtoonScrollEl` container below (its own `.no-scrollbar` class hides its
	// bar) — this just hides the document's own bar too, for the brief window
	// before that container mounts.
	$effect(() => {
		if (typeof document === 'undefined' || isPaged) return;
		document.documentElement.classList.add('no-scrollbar');
		return () => document.documentElement.classList.remove('no-scrollbar');
	});

	const bgClass = $derived(BG_CLASS[readerSettings.bg]);
	const isPaged = $derived(readerSettings.mode !== 'webtoon');
	// Double spreads need width; track viewport so we never render double on phones.
	let wideViewport = $state(true);
	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(min-width: 768px)');
		const sync = () => {
			wideViewport = mq.matches;
			if (!mq.matches && readerSettings.mode === 'double') {
				readerSettings.set('mode', 'paged');
			}
		};
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});
	const useDouble = $derived(readerSettings.mode === 'double' && wideViewport);
	const backHref = $derived(mangaId ? `/manga/${mangaId}` : '/history');
	const showOffline = $derived(offlineMode || !isOnline());
	const reserveDock = $derived(
		chapters.length > 0 && (chromeVisible || readerSettings.pinDock)
	);

	// Navigation index: paged uses stable URL chapterId (same as original),
	// webtoon uses currently-viewed section to update nav when infinite-scrolling.
	const navChapterIndex = $derived.by(() => {
		if (isPaged) return chapters.findIndex((c) => c.id === chapterId);
		if (!currentChapterId) return chapters.findIndex((c) => c.id === chapterId);
		return chapters.findIndex((c) => c.id === currentChapterId);
	});
	// chapters sorted descending (newest first): index-1 = newer, index+1 = older
	const prevChapter = $derived(
		navChapterIndex >= 0 && navChapterIndex < chapters.length - 1
			? chapters[navChapterIndex + 1]
			: null
	);
	const nextChapter = $derived(navChapterIndex > 0 ? chapters[navChapterIndex - 1] : null);

	// Next chapter for infinite scroll — chapters sorted descending (newest first),
	// so "next to read" = index - 1 (going toward newer/higher-numbered chapters).
	const lastSectionIndex = $derived.by(() => {
		if (sections.length === 0) return chapters.findIndex((c) => c.id === chapterId);
		const lastCh = sections[sections.length - 1]?.chapter;
		return chapters.findIndex((c) => c.id === lastCh?.id);
	});
	const nextUnloadedChapter = $derived(
		lastSectionIndex > 0 ? chapters[lastSectionIndex - 1] : null
	);

	// Chapter displayed in header and picker
	const viewedChapterId = $derived(currentChapterId || chapterId);
	const viewedSection = $derived(sections.find((s) => s.chapter.id === currentChapterId));
	const viewedChapterName = $derived(viewedSection?.chapter.name ?? current?.name ?? '');

	// Reading progress (0–1) for the thin top bar.
	// Webtoon: true scroll-extent progress (currentChapterProgress) so it hits exactly
	// 0 at chapter start and 1 once fully scrolled to chapter end.
	const scrollProgress = $derived.by(() => {
		if (isPaged) {
			return pages.length > 0 ? (currentPage + 1) / pages.length : 0;
		}
		return currentChapterProgress;
	});

	const pageLabel = $derived.by(() => {
		if (isPaged) return `${currentPage + 1} / ${pages.length}`;
		const total = viewedSection?.pages.length ?? pages.length;
		return total ? `${Math.min(currentPageIdx + 1, total)} / ${total}` : `${total} halaman`;
	});

	// `chapters`/`current` are fetched once per chapter load and otherwise never
	// touched again, so the picker/dock kept showing a chapter as unread until a
	// full reload even after its last page had been marked read server-side.
	// Patch the local copy the moment we know it's read so the UI reflects it live.
	// Webtoon's progress bar / page label only get a correct value once the
	// resume-scroll settles and its own IntersectionObserver reports back — until
	// then they're stuck at the reset defaults (0%, page 1), which for a chapter
	// resumed deep in (e.g. page 80/100) visibly looks like it reopened from the
	// start for as long as that settle takes. Seed them from initialPage/
	// initialPageProgress right when pages are known so they're already
	// accurate, not just page-index-close; the observer's first real report
	// only refines them further (true scroll-extent progress vs this estimate).
	function seedWebtoonProgress(pageCount: number) {
		if (isPaged || pageCount <= 0) return;
		const idx = Math.min(Math.max(initialPage, 0), pageCount - 1);
		currentPageIdx = idx;
		currentPageProgress = initialPageProgress;
		// Blend the fraction WITHIN the page into the chapter-wide estimate so
		// the top progress bar doesn't visibly hop backward once the real
		// scroll-extent report lands a moment later.
		currentChapterProgress =
			pageCount > 1 ? Math.min(1, (idx + initialPageProgress) / (pageCount - 1)) : 0;
	}

	function markChapterReadLocally(id: number) {
		chapters = chapters.map((c) => (c.id === id ? { ...c, isRead: true } : c));
		if (current?.id === id) current = { ...current, isRead: true };
	}

	// A chapter can be read-only-locally (guest, offline, another device that
	// never synced to Suwayomi) — the `chapters` snapshot only reflects the
	// SERVER's isRead. Checking local history too means a chapter read on this
	// device never gets reported as unread again, even before any server sync.
	function isChapterReadAnywhere(id: number): boolean {
		if (chapters.find((c) => c.id === id)?.isRead) return true;
		return localData.history.find((h) => h.chapterId === id)?.isRead ?? false;
	}

		function reportPage(index: number) {
		currentPage = index;
		// Monotonic: never let scrolling back downgrade an already-read chapter
		// back to unread (isRead here is recomputed from raw page position on
		// every call, so without this guard it would flip false again).
		const alreadyRead = isChapterReadAnywhere(chapterId);
		const isRead =
			alreadyRead || (pages.length > 0 && index >= pages.length - 1);
		void queueChapterProgress(chapterId, index, isRead);
		if (isRead) markChapterReadLocally(chapterId);
		if (mangaId) {
			localData.recordHistory({
				chapterId,
				mangaId,
				mangaTitle,
				thumbnailUrl: mangaThumb,
				chapterName: current?.name ?? 'Chapter',
				lastPage: index,
				isRead,
				sourceId: mangaSourceId,
				chapterNumber: current?.chapterNumber,
				totalPages: pages.length
			});
		}
		// Flush accumulated time at each page boundary — worst-case loss on a
		// crash is bounded to "time on the in-flight page" rather than the whole
		// session.
		readingTimer.pingActivity();
		void readingTimer.flush();
	}

	let lastReportedPageKey = '';
	let lastPersistedAt = 0;
	let lastPersistedPageProgress = 0;
	let lastBackfilledChapterId = 0;

	// Fast/momentum scroll can carry the viewport past a chapter's last page
	// before the IntersectionObserver ever reports it as active, so that page's
	// own isRead write never fires. Once we're confirmed inside a later chapter,
	// every earlier chapter in `sections` has necessarily been scrolled past —
	// backfill isRead for those instead of relying solely on the per-page check.
	function backfillPassedChapters(sectionChapterId: number) {
		if (sectionChapterId === lastBackfilledChapterId) return;
		lastBackfilledChapterId = sectionChapterId;
		const idx = sections.findIndex((s) => s.chapter.id === sectionChapterId);
		if (idx <= 0) return;
		for (const s of sections.slice(0, idx)) {
			if (isChapterReadAnywhere(s.chapter.id)) continue;
			void queueChapterProgress(s.chapter.id, s.pages.length - 1, true);
			markChapterReadLocally(s.chapter.id);
			if (mangaId) {
				localData.recordHistory({
					chapterId: s.chapter.id,
					mangaId,
					mangaTitle,
					thumbnailUrl: mangaThumb,
					chapterName: s.chapter.name,
					lastPage: s.pages.length - 1,
					isRead: true,
					sourceId: mangaSourceId,
					chapterNumber: s.chapter.chapterNumber,
					totalPages: s.pages.length
				});
			}
		}
	}

	// Persisting on every scroll-driven tick would fire dozens of writes/sec and
	// stutter the main thread, so this is throttled — see the guard below. That
	// throttle window means the very LAST position before the reader actually
	// leaves (closes the tab, backgrounds the app, navigates away) can still be
	// sitting unpersisted when it happens. `force` (used by flushWebtoonProgressNow)
	// bypasses the throttle for exactly that moment, using whatever `currentPageIdx`/
	// `currentPageProgress` were last tracked — those two are updated on EVERY
	// report, never throttled, so they're always the true latest position.
	function persistWebtoonProgress(
		sectionChapterId: number,
		pageIdx: number,
		pageProgress: number,
		chapterProgress: number,
		force = false
	) {
		const section = sections.find((s) => s.chapter.id === sectionChapterId);
		if (!section || !mangaId) return;
		const pageKey = `${section.chapter.id}-${pageIdx}`;
		const pageChanged = pageKey !== lastReportedPageKey;
		const now = Date.now();
		const fractionDrift = Math.abs(pageProgress - lastPersistedPageProgress);
		if (!force && !pageChanged && (fractionDrift < 0.05 || now - lastPersistedAt < 1500)) return;
		lastReportedPageKey = pageKey;
		lastPersistedAt = now;
		lastPersistedPageProgress = pageProgress;
		// Monotonic: same guard as reportPage — don't downgrade a read chapter
		// back to unread when re-scrolling an earlier page. Scroll-extent
		// progress ~1 also counts as read: it covers the case where the last
		// page's own report got skipped but the chapter was scrolled to its end.
			const alreadyRead = isChapterReadAnywhere(section.chapter.id);
			const isRead = isWebtoonChapterRead({
				alreadyRead,
				pageIdx,
				pageCount: section.pages.length,
				chapterProgress,
				pageProgress
			});
			if (pageChanged || force) {
				void queueChapterProgress(section.chapter.id, pageIdx, isRead);
				if (isRead) markChapterReadLocally(section.chapter.id);
			}
		void localData.recordHistory({
			chapterId: section.chapter.id,
			mangaId,
			mangaTitle,
			thumbnailUrl: mangaThumb,
			chapterName: section.chapter.name,
			lastPage: pageIdx,
			lastPageProgress: pageProgress,
			isRead,
			sourceId: mangaSourceId,
			chapterNumber: section.chapter.chapterNumber,
			totalPages: section.pages.length
		});
	}

	// Force-persist whatever position was last tracked, bypassing the throttle.
	// Wired to visibilitychange/pagehide/unmount below — the moments the reader
	// might never get another scroll tick to naturally flush through.
	function flushWebtoonProgressNow() {
		if (isPaged || !currentChapterId) return;
		persistWebtoonProgress(
			currentChapterId,
			currentPageIdx,
			currentPageProgress,
			currentChapterProgress,
			true
		);
	}

	function reportWebtoonPage(
		sectionChapterId: number,
		pageIdx: number,
		pageProgress: number,
		chapterProgress: number
	) {
		// 0 is WebtoonView's "not tracking anything yet" sentinel (right after a
		// hard chapter switch, before any page has intersected) — never let it
		// overwrite the chapter id the URL/nav effect just set.
		if (!sectionChapterId) return;
		if (currentChapterId !== sectionChapterId) syncUrlToChapter(sectionChapterId);
		currentChapterId = sectionChapterId;
		currentPageIdx = pageIdx;
		currentPageProgress = pageProgress;
		currentChapterProgress = chapterProgress;
		backfillPassedChapters(sectionChapterId);
		persistWebtoonProgress(sectionChapterId, pageIdx, pageProgress, chapterProgress);
		readingTimer.pingActivity();
		void readingTimer.flush();
	}

	async function handleNearEnd() {
		if (loadingNextChapter || !nextUnloadedChapter) return;
		loadingNextChapter = true;
		nextChapterError = '';
		try {
			const nextPages = (await fetchChapterPages(nextUnloadedChapter.id)).map((p) => apiUrl(p));
			sections = [...sections, { chapter: nextUnloadedChapter, pages: nextPages }];
		} catch {
			nextChapterError = 'Gagal memuat chapter berikutnya.';
			showToast('Gagal memuat chapter berikutnya. Coba lagi.', 'error');
		} finally {
			loadingNextChapter = false;
		}
	}

	// Keep at most one chapter of scrollback loaded behind the one the reader is
	// currently on — otherwise `sections` (and the DOM/images under it) grows
	// without bound the longer someone keeps scrolling through a series.
	// Dropping content that's above the viewport shrinks scrollHeight, so we
	// compensate scrollTop by the removed amount to avoid a visible jump.
	//
	// The prune is DEFERRED until the scroller is idle. It naturally triggers
	// right as the reader crosses into a new chapter — i.e. exactly when a
	// momentum fling is most likely still in flight — and iOS Safari IGNORES
	// programmatic scrollTop/scrollBy while momentum scrolling is running. The
	// flushSync compensation below then silently failed: the DOM shrank by the
	// pruned chapter's height but the scroll position stayed, teleporting the
	// reader roughly one chapter forward ("suddenly mid-chapter, had to scroll
	// back up"). Chrome never showed this because its native scroll anchoring
	// already corrects removals above the viewport (delta computes to 0 there).
	let pruneTimer: ReturnType<typeof setInterval> | null = null;
	let touchActive = false;

	$effect(() => {
		if (typeof window === 'undefined') return;
		const down = () => (touchActive = true);
		const up = () => (touchActive = false);
		window.addEventListener('touchstart', down, { passive: true });
		window.addEventListener('touchend', up, { passive: true });
		window.addEventListener('touchcancel', up, { passive: true });
		return () => {
			window.removeEventListener('touchstart', down);
			window.removeEventListener('touchend', up);
			window.removeEventListener('touchcancel', up);
		};
	});

	$effect(() => {
		const idx = sections.findIndex((s) => s.chapter.id === currentChapterId);
		if (idx <= 1) return;
		schedulePrune();
		return () => {
			if (pruneTimer) {
				clearInterval(pruneTimer);
				pruneTimer = null;
			}
		};
	});

	// Wait until the scroll position has been stable for one 200ms tick with no
	// finger down, then prune. Fallback: force it after 15s even without idle
	// (e.g. auto-scroll never settles) — auto-scroll isn't momentum, so the
	// compensation works there, and the verify-retry below covers stragglers.
	function schedulePrune() {
		if (pruneTimer) return;
		let lastTop = webtoonScrollEl?.scrollTop ?? 0;
		let waited = 0;
		pruneTimer = setInterval(() => {
			const el = webtoonScrollEl;
			if (!el) return;
			waited += 200;
			const idle = Math.abs(el.scrollTop - lastTop) < 1 && !touchActive;
			lastTop = el.scrollTop;
			if (!idle && waited < 15000) return;
			if (pruneTimer) clearInterval(pruneTimer);
			pruneTimer = null;
			pruneSections();
		}, 200);
	}

	function pruneSections() {
		const idx = sections.findIndex((s) => s.chapter.id === currentChapterId);
		if (idx <= 1) return;
		const dropCount = idx - 1;
		// Anchor on the first page of the section that survives the prune (not
		// document.scrollHeight) — the whole-page height is unreliable here since
		// a newly-appended next chapter is likely still loading images below,
		// which would pollute a scrollHeight diff and cause a bogus scroll jump.
		const anchorSelector = `[data-page-key="${sections[dropCount].chapter.id}-0"]`;
		const topBefore = document.querySelector(anchorSelector)?.getBoundingClientRect().top;
		// flushSync (not tick().then) applies the DOM mutation and the scroll
		// correction in the same synchronous pass — with a paint in between, the
		// browser shows a frame of the OLD scrollTop against the shrunk content.
		flushSync(() => {
			sections = sections.slice(dropCount);
		});
		if (topBefore === undefined) return;
		const correct = (): boolean => {
			const topAfter = document.querySelector(anchorSelector)?.getBoundingClientRect().top;
			if (topAfter === undefined) return true;
			const delta = topAfter - topBefore;
			if (Math.abs(delta) < 1) return true;
			webtoonScrollEl?.scrollBy(0, delta);
			return false;
		};
		// Belt-and-suspenders for the same iOS quirk: verify the correction
		// actually landed and reapply for a few frames if the browser ate it.
		if (!correct()) {
			let tries = 0;
			const tick = () => {
				if (!correct() && ++tries < 10) requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		}
	}

	function toggleChrome() {
		chromeVisible = !chromeVisible;
	}

	async function refreshOfflineFlag(id: number) {
		const row = await getOfflineChapter(id).catch(() => null);
		chapterOffline = !!row || offlineMode;
	}

	function toggleFullscreen() {
		if (typeof document === 'undefined') return;
		if (!document.fullscreenElement) {
			void document.documentElement.requestFullscreen?.().catch(() => {
				showToast('Layar penuh tidak didukung di browser ini.', 'info');
			});
		} else {
			void document.exitFullscreen?.();
		}
	}

	$effect(() => {
		if (typeof document === 'undefined') return;
		const onFs = () => {
			isFullscreen = !!document.fullscreenElement;
		};
		document.addEventListener('fullscreenchange', onFs);
		onFs();
		return () => document.removeEventListener('fullscreenchange', onFs);
	});

	async function saveCurrentOffline() {
		const chId = viewedChapterId || chapterId;
		if (!mangaId || chapterOffline || downloadProgress != null) return;
		if (!isOnline()) {
			showToast('Butuh koneksi untuk mengunduh chapter.', 'error');
			return;
		}
		const name =
			viewedChapterName || current?.name || chapters.find((c) => c.id === chId)?.name || 'Chapter';
		downloadProgress = 0;
		try {
			await cacheChapterToDevice(
				chId,
				mangaId,
				mangaTitle || 'Manga',
				name,
				(d, total) => {
					downloadProgress = Math.round((d / total) * 100);
				},
				mangaThumb,
				mangaSourceId
			);
			chapterOffline = true;
			showToast('Chapter tersimpan offline.', 'success');
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'Gagal simpan offline.', 'error');
		} finally {
			downloadProgress = null;
		}
	}

	function makeStubChapter(id: number, name = 'Chapter'): Chapter {
		return {
			id,
			name,
			chapterNumber: 0,
			isRead: false,
			isDownloaded: true,
			lastPageRead: 0,
			uploadDate: '',
			sourceOrder: 0
		};
	}

	async function hydrateOfflineMeta(id: number) {
		const meta = await getOfflineChapter(id).catch(() => null);
		if (!meta) return makeStubChapter(id);
		mangaId = meta.mangaId;
		mangaTitle = meta.mangaTitle || mangaTitle;
		mangaThumb = meta.thumbnailUrl ? apiUrl(meta.thumbnailUrl) : mangaThumb;
		mangaSourceId = meta.sourceId ?? mangaSourceId;
		return makeStubChapter(id, meta.chapterName || 'Chapter');
	}

	// Webtoon mode doesn't remount on chapter change — the same component instance
	// streams new chapters into `sections`. Track the section the user is
	// actually viewing so `readingTimer` attributes time correctly without the
	// paged-mode chapterId-driven $effect firing.
	$effect(() => {
		const id = isPaged ? 0 : currentChapterId;
		if (!id) return;
		readingTimer.startChapter(id);
		return () => {
			if (!isPaged) void readingTimer.flush();
		};
	});

	// Idle heuristic in webtoon: any scroll/touch/keypress counts as activity so
	// autoscroll doesn't trip the 5-min idle cutoff mid-stream. `scroll` is
	// listened on webtoonScrollEl specifically — it's the actual scroll surface
	// (position:fixed, self-scrolling) and scroll events on it don't bubble to
	// window.
	$effect(() => {
		if (typeof window === 'undefined') return;
		const onActivity = () => readingTimer.pingActivity();
		const scrollTarget = webtoonScrollEl;
		scrollTarget?.addEventListener('scroll', onActivity, { passive: true });
		window.addEventListener('keydown', onActivity);
		window.addEventListener('touchstart', onActivity, { passive: true });
		window.addEventListener('pointerdown', onActivity);
		return () => {
			scrollTarget?.removeEventListener('scroll', onActivity);
			window.removeEventListener('keydown', onActivity);
			window.removeEventListener('touchstart', onActivity);
			window.removeEventListener('pointerdown', onActivity);
		};
	});

	// The throttled persist in persistWebtoonProgress can leave the LAST scroll
	// position unwritten for up to ~1.5s — fine while reading continues (the
	// next tick catches up), but if the reader backgrounds the tab or closes it
	// right after a big scroll, that position is lost for good. `pagehide` is
	// the reliable "actually leaving" signal on mobile Safari (unlike
	// `beforeunload`, which iOS often skips entirely); `visibilitychange` also
	// catches app-switch/lock-screen without a full unload. `freeze` (Page
	// Lifecycle) covers Chrome discard / frozen background tabs where neither
	// hide nor pagehide may fire before the JS heap is frozen.
	$effect(() => {
		if (typeof document === 'undefined') return;
		const onHide = () => {
			if (document.visibilityState === 'hidden') flushWebtoonProgressNow();
		};
		document.addEventListener('visibilitychange', onHide);
		window.addEventListener('pagehide', flushWebtoonProgressNow);
		// Page Lifecycle `freeze` fires on Document (Chrome discard / frozen bg).
		// Not on every engine — add/remove is a silent no-op where unsupported.
		document.addEventListener('freeze', flushWebtoonProgressNow);
		return () => {
			document.removeEventListener('visibilitychange', onHide);
			window.removeEventListener('pagehide', flushWebtoonProgressNow);
			document.removeEventListener('freeze', flushWebtoonProgressNow);
		};
	});

	// Mode switch webtoon → paged/double: flushWebtoonProgressNow no-ops once
	// `isPaged` is already true, so the last in-page fraction would stick only
	// in memory. Force-persist via persistWebtoonProgress directly on leave.
	// Paged leave does not need this path — reportPage writes on every page flip.
	let prevWasWebtoon = readerSettings.mode === 'webtoon';
	$effect(() => {
		const webtoon = readerSettings.mode === 'webtoon';
		if (prevWasWebtoon && !webtoon && currentChapterId) {
			persistWebtoonProgress(
				currentChapterId,
				currentPageIdx,
				currentPageProgress,
				currentChapterProgress,
				true
			);
		}
		prevWasWebtoon = webtoon;
	});

	// $effect reruns whenever chapterId changes (client-side nav between chapters),
	// or when navigateToChapter forces a reset for a stale-param target (navNonce).
	$effect(() => {
		const id = chapterId;
		navNonce;
		let cancelled = false;

		// Start the reading timer for paged mode. The cleanup function runs when
		// the user navigates to another chapter (SvelteKit `goto`), flushing the
		// accumulated time so it lands in IndexedDB before the next chapter.
		readingTimer.startChapter(id);
		const stopTimer = () => {
			void readingTimer.flush();
			readingTimer.stop();
		};

		// Reset all per-chapter state
		pages = [];
		sections = [];
		chapters = [];
		current = null;
		mangaId = null;
		mangaTitle = '';
		mangaThumb = null;
		mangaSourceId = null;
		loading = true;
		error = '';
		offlineMode = false;
		chapterOffline = false;
		downloadProgress = null;
		void refreshOfflineFlag(id);
		currentPage = 0;
		initialPage = 0;
		initialPageProgress = 0;
		currentChapterId = id;
		// Namespaced by chapter id so leaving these stale is currently harmless,
		// but resetting them here removes the latent coupling defensively.
		lastReportedPageKey = '';
		lastPersistedAt = 0;
		lastPersistedPageProgress = 0;
		lastBackfilledChapterId = 0;
		// Zero the scroll BEFORE the DOM collapses to the loading shimmer. If the
		// user was deep in a long chapter, swapping to the (much shorter) shimmer
		// while scrollTop is huge makes iOS clamp the position mid-momentum — a
		// top rubber-band that reveals the standalone-PWA domain bar, which then
		// sticks as a black band above the reader. Zeroing synchronously here
		// means there is never anything to clamp.
		if (typeof document !== 'undefined') document.documentElement.scrollTop = 0;
		currentPageIdx = 0;
		currentPageProgress = 0;
		currentChapterProgress = 0;
		loadingNextChapter = false;

		async function load() {
			try {
				// On a cold start (PWA launch, hard reload) the reader used to read
				// localData.history before IndexedDB hydration finished — always
				// empty, so the resume position silently reset to page 0. Await
				// hydration first; init() is a no-op once already hydrated.
				await localData.init();
				if (cancelled) return;
				// Resume only applies to a chapter someone is partway through. A
				// FINISHED chapter stores lastPage = its final page, so resuming to it
				// meant every re-open (next-chapter nav into an already-read chapter,
				// "lanjutkan baca" from Riwayat) landed on the chapter's END instead
				// of its start — re-reads must open at page 0.
				initialPage = untrack(() => resumePageFor(localData.history, id));

				if (!isOnline()) {
					const cached = await getCachedPageUrls(id);
					if (cancelled) return;
					if (cached?.length) {
						pages = cached;
						offlineMode = true;
						chapterOffline = true;
						const stub = await hydrateOfflineMeta(id);
						if (cancelled) return;
						current = stub;
						initialPageProgress = untrack(() =>
							resumeProgressFor(localData.history, id, initialPage)
						);
						initialPage = untrack(() =>
							clampResumeToFreshPageCount(localData.history, id, initialPage, cached.length)
						);
						sections = [{ chapter: stub, pages: cached }];
						if (initialPage > 0 && initialPage < cached.length) currentPage = initialPage;
						seedWebtoonProgress(cached.length);
						return;
					}
					throw new Error('Offline — chapter belum disimpan di perangkat.');
				}

				// Cold-open: pages + chapter/manga meta are independent — fetch in
				// parallel. Chapter list still needs mangaId from meta, so it stays
				// sequential after this join.
				const [fetchedPagesRaw, meta] = await Promise.all([
					fetchChapterPages(id),
					fetchChapterMangaMeta(id)
				]);
				if (cancelled) return;
				const fetchedPages = fetchedPagesRaw.map((p) => apiUrl(p));
				pages = fetchedPages;

				mangaId = meta.mangaId;
				if (meta.manga) {
					mangaTitle = meta.manga.title ?? '';
					mangaThumb = meta.manga.thumbnailUrl ? apiUrl(meta.manga.thumbnailUrl) : null;
					mangaSourceId = meta.manga.sourceId ?? null;
				}
				const resolvedMangaId = meta.mangaId;

				if (resolvedMangaId) {
					const fetchedChapters = await getMangaChapters(resolvedMangaId);
					if (cancelled) return;
					chapters = fetchedChapters;
					// Suwayomi may have re-created chapter rows (new ids) since the
					// history rows were written — re-key them so the read-state guard
					// and the resume lookup below see this device's actual progress,
					// and re-assert that state on the server for the new ids.
					const migrated = await localData.migrateChapterIds(resolvedMangaId, fetchedChapters);
					for (const m of migrated) void queueChapterProgress(m.chapterId, m.lastPage, m.isRead);
					if (cancelled) return;
					if (!initialPage) {
							initialPage = untrack(() => resumePageFor(localData.history, id));
						}
					current = chapters.find((c) => c.id === id) ?? null;
					// This device may have no local history for the chapter (new
					// device, cleared storage) — fall back to the server-side
					// position other devices reported. Same rule as resumePageFor:
					// a finished chapter reopens at the start, not its end — and a
					// position parked on the last page counts as finished even with
					// isRead false (stale footprint of the old webtoon recorder).
					if (
						!initialPage &&
						current &&
						!current.isRead &&
						!untrack(() => localData.history.find((h) => h.chapterId === id)?.isRead) &&
						(current.lastPageRead ?? 0) > 0 &&
						current.lastPageRead < pages.length - 1
					) {
						initialPage = current.lastPageRead;
					}
					// Refresh latest snapshot without clearing badges (unless first seed).
					if (chapters.length && mangaTitle) {
						void updates.seedFromChapters(
							{
								mangaId: resolvedMangaId,
								title: mangaTitle,
								thumbnailUrl: mangaThumb,
								sourceId: mangaSourceId
							},
							chapters,
							{ markSeen: false }
						);
					}
					// Restore last mode/direction used for this series.
					readerSettings.applyForManga(resolvedMangaId);
				}

				initialPageProgress = untrack(() =>
						resumeProgressFor(localData.history, id, initialPage)
					);
					initialPage = untrack(() =>
						clampResumeToFreshPageCount(localData.history, id, initialPage, pages.length)
					);
					sections = [{ chapter: current ?? makeStubChapter(id), pages }];
					if (initialPage > 0 && initialPage < pages.length) {
						currentPage = initialPage;
					} else {
						document.documentElement.scrollTop = 0;
					}
					seedWebtoonProgress(pages.length);
				// Preserve the already-known read state — this call's job is only to
				// persist the resume position (currentPage). Hardcoding `false` here
				// used to flip an already-read chapter back to unread on the server
				// the instant it was reopened (e.g. jumping back via the chapter
				// list/dock), even before any scrolling happened. `current?.isRead` is
				// only the SERVER's flag though — merge in local history too, or a
				// chapter read only on this device (guest/offline/unsynced) gets
				// re-asserted unread on the server the moment it's reopened.
				if (pages.length > 0) {
					void queueChapterProgress(id, currentPage, isChapterReadAnywhere(id));
				}
			} catch (e) {
				if (cancelled) return;
				const cached = await getCachedPageUrls(id);
				if (cancelled) return;
				if (cached?.length) {
					pages = cached;
					offlineMode = true;
					chapterOffline = true;
					const stub = await hydrateOfflineMeta(id);
					if (cancelled) return;
					current = stub;
						initialPageProgress = untrack(() =>
							resumeProgressFor(localData.history, id, initialPage)
						);
						initialPage = untrack(() =>
							clampResumeToFreshPageCount(localData.history, id, initialPage, cached.length)
						);
						sections = [{ chapter: stub, pages: cached }];
						if (initialPage > 0 && initialPage < cached.length) {
							currentPage = initialPage;
						}
						seedWebtoonProgress(cached.length);
					} else {
						error = e instanceof Error ? e.message : 'Gagal memuat reader';
					}
			} finally {
				if (!cancelled) loading = false;
			}
		}

		load();

		return () => {
			cancelled = true;
			flushWebtoonProgressNow();
			stopTimer();
			readerSettings.clearActiveManga();
		};
	});

	// Pure fetch — the caller applies the result to component state. (Previously
	// this function set mangaTitle/mangaThumb/mangaSourceId itself, a hidden side
	// effect on something named/shaped like a plain resolver.)
	async function fetchChapterMangaMeta(id: number): Promise<{
		mangaId: number | null;
		manga: { title?: string; thumbnailUrl?: string; sourceId?: string } | null;
	}> {
		const res = await fetch('/api/graphql', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: `query($id: Int!) { chapter(id: $id) { mangaId name manga { title thumbnailUrl sourceId } } }`,
				variables: { id }
			})
		});
		const json = await res.json();
		const ch = json?.data?.chapter;
		return { mangaId: ch?.mangaId ?? null, manga: ch?.manga ?? null };
	}

	const pageTitle = $derived.by(() => {
		if (viewedChapterName && mangaTitle) return `${viewedChapterName} · ${mangaTitle} · Komik Reader`;
		if (viewedChapterName) return `${viewedChapterName} · Komik Reader`;
		if (mangaTitle) return `${mangaTitle} · Komik Reader`;
		return 'Baca · Komik Reader';
	});

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return (
			target.tagName === 'INPUT' ||
			target.tagName === 'TEXTAREA' ||
			target.tagName === 'SELECT' ||
			target.isContentEditable
		);
	}

	function onReaderKeydown(e: KeyboardEvent) {
		if (loading || error || isEditableTarget(e.target)) return;
		if (settingsOpen) return; // Sheet handles Escape

		if (e.key === 'Escape') {
			e.preventDefault();
			chromeVisible = !chromeVisible;
			return;
		}
		if (e.key === 'a' || e.key === 'A') {
			if (isPaged) return;
			e.preventDefault();
			autoScroll = !autoScroll;
			if (autoScroll) chromeVisible = false;
			return;
		}
		if (e.key === '[') {
			if (!prevChapter) return;
			e.preventDefault();
			navigateToChapter(prevChapter.id);
			return;
		}
		if (e.key === ']') {
			if (!nextChapter) return;
			e.preventDefault();
			navigateToChapter(nextChapter.id);
		}
	}
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<svelte:window onkeydown={onReaderKeydown} />

<section class="relative min-h-dvh w-full {bgClass} {reserveDock ? 'lg:pr-72' : ''}">
	{#if loading}
		<a
			href={backHref}
			aria-label="Kembali"
			class="fixed left-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur transition hover:bg-black/70"
			style="top: calc(env(safe-area-inset-top) + 0.75rem)"
		>
			<ArrowLeft size={18} />
		</a>
		<div class="flex min-h-dvh flex-col">
			<!-- shimmer strips — full width, no border-radius, mimic page panels -->
			<div class="flex flex-col gap-[3px] pt-[3px]">
				{#each [42, 58, 48, 62, 50, 55, 44] as pct}
					<div
						class="w-full overflow-hidden bg-white/[0.05]"
						style="height: {pct}vh"
					>
						<div class="h-full w-full animate-[shimmer_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent bg-[length:200%_100%]"></div>
					</div>
				{/each}
			</div>
		</div>
	{:else if error}
		<div class="mx-auto max-w-md px-4 py-20 text-center">
			<div
				class="rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
			>
				{error}
			</div>
			<p class="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-white/70">
				<button
					type="button"
					class="text-accent hover:underline"
					onclick={() => location.reload()}
				>
					Coba lagi
				</button>
				<a href="/downloads" class="text-accent hover:underline">Chapter offline</a>
				<a href={backHref} class="inline-flex items-center gap-1 text-accent hover:underline">
					<ArrowLeft size={14} /> Kembali
				</a>
			</p>
		</div>
	{:else}
		{#if readerSettings.brightness < 1}
			<div
				class="pointer-events-none fixed inset-0 z-20 bg-black"
				style="opacity: {1 - readerSettings.brightness}"
			></div>
		{/if}

		{#if isPaged}
			<PagedView
				{pages}
				bind:current={currentPage}
				double={useDouble}
				doubleOffset={readerSettings.doubleOffset}
				fit={readerSettings.fit}
				zoom={readerSettings.zoom}
				direction={readerSettings.direction}
				onpage={reportPage}
				ontoggle={toggleChrome}
				onnext={() => nextChapter && navigateToChapter(nextChapter.id)}
				onprev={() => prevChapter && navigateToChapter(prevChapter.id)}
				onzoom={(z) => readerSettings.set('zoom', z)}
				onrefreshpages={() => refreshChapterPages(chapterId)}
			/>
		{:else}
			<!-- position:fixed takes this out of document flow entirely, so html/body
			     never grow tall and never accumulate a scroll offset of their own —
			     that alone stops the document's own scrollbar. But iOS Safari's
			     momentum-scroll pill indicator isn't a CSS-stylable scrollbar at all;
			     it renders for ANY scrolling element (div or document) and no
			     ::-webkit-scrollbar/scrollbar-width rule can hide it. The only thing
			     that works: make the scrolling element wider than its visible area and
			     let this outer wrapper's overflow-hidden clip away the strip (and the
			     pill riding on its edge) that sticks out past the viewport. -->
			<div
				class="fixed inset-0 overflow-hidden {reserveDock ? 'lg:right-72' : ''}"
			>
				<div
					class="reader-webtoon-scroll no-scrollbar h-full overflow-y-auto overflow-x-hidden"
					data-reader-scroll
					bind:this={webtoonScrollEl}
				>
					<div class="reader-webtoon-content">
						<!-- Tap toggles chrome only when the finger didn't scroll (avoids whole-page
						     role=button fighting with intentional scroll / auto-scroll). -->
						<!-- eslint-disable-next-line svelte/valid-compile -->
						<div
							class="w-full cursor-default"
							role="presentation"
							onpointerdown={(e) => {
								(e.currentTarget as HTMLElement).dataset.ptrY = String(e.clientY);
								(e.currentTarget as HTMLElement).dataset.ptrX = String(e.clientX);
							}}
							onclick={(e) => {
								if ((e.target as HTMLElement).closest('button, a')) return;
								const el = e.currentTarget as HTMLElement;
								const y0 = Number(el.dataset.ptrY ?? e.clientY);
								const x0 = Number(el.dataset.ptrX ?? e.clientX);
								if (Math.hypot(e.clientX - x0, e.clientY - y0) > 12) return;
								toggleChrome();
							}}
						>
							<WebtoonView
								{sections}
								zoom={readerSettings.zoom}
								gap={readerSettings.gap}
								onpage={reportWebtoonPage}
								onnearend={handleNearEnd}
								onzoom={(z) => readerSettings.set('zoom', z)}
								{initialPage}
								initialProgress={initialPageProgress}
								resetToken={`${chapterId}:${navNonce}`}
								onrefreshpages={refreshChapterPages}
							/>
						</div>
						{#if loadingNextChapter}
							<div class="flex items-center justify-center py-8 text-white/50">
								<Spinner size={20} />
							</div>
						{:else if nextChapterError}
							<div class="flex flex-col items-center gap-2 px-4 py-8 text-center">
								<p class="text-sm text-white/70">{nextChapterError}</p>
								<button
									type="button"
									class="rounded-full bg-white/10 px-4 py-2 text-sm text-white/90 transition hover:bg-white/20"
									onclick={() => {
										nextChapterError = '';
										void handleNearEnd();
									}}
								>
									Coba lagi
								</button>
							</div>
						{:else if !nextUnloadedChapter && sections.length > 0 && chapters.length > 0}
							<div class="flex flex-col items-center gap-3 px-4 py-16 text-center text-white/70">
								<CheckCircle size={28} class="text-success" />
								<p class="text-sm font-medium text-white/80">Kamu sudah di chapter terbaru</p>
								<a
									href={backHref}
									class="rounded-full bg-white/10 px-5 py-2 text-sm text-white/80 transition hover:bg-white/20"
								>
									Kembali ke detail
								</a>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<ReaderControls
			show={chromeVisible}
			title={mangaTitle || (current?.name ?? 'Chapter')}
			chapterName={viewedChapterName}
			{pageLabel}
			{backHref}
			prevHref={prevChapter ? `/read/${prevChapter.id}` : null}
			nextHref={nextChapter ? `/read/${nextChapter.id}` : null}
			showSlider={isPaged}
			bind:current={currentPage}
			max={pages.length - 1}
			offlineMode={showOffline}
			{scrollProgress}
			{chapters}
			currentChapterId={viewedChapterId}
			{chapterOffline}
			{downloadProgress}
			fullscreen={isFullscreen}
			pinDock={readerSettings.pinDock}
			ondownload={mangaId && !chapterOffline ? saveCurrentOffline : undefined}
			onfullscreen={toggleFullscreen}
			onsettings={() => (settingsOpen = true)}
			onseek={reportPage}
			onnavigate={navigateToChapter}
			autoScroll={!isPaged ? autoScroll : undefined}
			{autoScrollSpeed}
			onautoscroll={!isPaged ? () => { autoScroll = !autoScroll; if (autoScroll) chromeVisible = false; } : undefined}
			onautoscrollspeed={!isPaged ? (d) => (autoScrollSpeed = Math.min(8, Math.max(0.5, +(autoScrollSpeed + d).toFixed(1)))) : undefined}
		/>

		<ReaderSettings bind:open={settingsOpen} />
		<ReaderCoach isWebtoon={!isPaged} />

	{/if}
</section>
