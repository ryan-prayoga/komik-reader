<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { untrack, tick } from 'svelte';
	import { apiUrl } from '$lib/graphql/client';
	import { fetchChapterPages, getMangaChapters, updateChapterProgress } from '$lib/graphql/api';
	import { isOnline } from '$lib/offline/connection.svelte';
	import { getCachedPageUrls } from '$lib/offline/cache';
	import { readerSettings, BG_CLASS } from '$lib/reader-settings.svelte';
	import { localData } from '$lib/local/data.svelte';
	import { readingTimer } from '$lib/reading-time';
	import WebtoonView from '$lib/components/reader/WebtoonView.svelte';
	import PagedView from '$lib/components/reader/PagedView.svelte';
	import ReaderControls from '$lib/components/reader/ReaderControls.svelte';
	import ReaderSettings from '$lib/components/reader/ReaderSettings.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import type { Chapter } from '$lib/graphql/types';

	const chapterId = $derived(Number($page.params.chapterId));

	// Paged mode
	let pages = $state<string[]>([]);
	let currentPage = $state(0);
	let initialPage = $state(0);

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
	let chromeVisible = $state(true);
	let settingsOpen = $state(false);
	let autoScroll = $state(false);
	let autoScrollSpeed = $state(readerSettings.autoScrollSpeed);

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
				if (whole !== 0) window.scrollBy(0, whole);
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
	// wherever the user actually scrolled to. Keep the address bar in sync with
	// a silent history.replaceState (native, not SvelteKit's goto/replaceState)
	// so it doesn't re-run this component's load effect on every chapter change.
	$effect(() => {
		if (isPaged || !currentChapterId || currentChapterId === chapterId) return;
		history.replaceState(history.state, '', `/read/${currentChapterId}`);
	});

	const bgClass = $derived(BG_CLASS[readerSettings.bg]);
	const isPaged = $derived(readerSettings.mode !== 'webtoon');
	const backHref = $derived(mangaId ? `/manga/${mangaId}` : '/history');

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

	const pageLabel = $derived(
		isPaged
			? `${currentPage + 1} / ${pages.length}`
			: `${viewedSection?.pages.length ?? pages.length} halaman`
	);

	// `chapters`/`current` are fetched once per chapter load and otherwise never
	// touched again, so the picker/dock kept showing a chapter as unread until a
	// full reload even after its last page had been marked read server-side.
	// Patch the local copy the moment we know it's read so the UI reflects it live.
	function markChapterReadLocally(id: number) {
		chapters = chapters.map((c) => (c.id === id ? { ...c, isRead: true } : c));
		if (current?.id === id) current = { ...current, isRead: true };
	}

	function reportPage(index: number) {
		currentPage = index;
		const isRead = index >= pages.length - 1;
		updateChapterProgress(chapterId, index, isRead).catch(() => {});
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
			if (chapters.find((c) => c.id === s.chapter.id)?.isRead) continue;
			updateChapterProgress(s.chapter.id, s.pages.length - 1, true).catch(() => {});
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

	function reportWebtoonPage(
		sectionChapterId: number,
		pageIdx: number,
		pageProgress: number,
		chapterProgress: number
	) {
		currentChapterId = sectionChapterId;
		currentPageIdx = pageIdx;
		currentPageProgress = pageProgress;
		currentChapterProgress = chapterProgress;
		backfillPassedChapters(sectionChapterId);
		const section = sections.find((s) => s.chapter.id === sectionChapterId);
		if (!section || !mangaId) return;
		// Persisting (GraphQL mutation + IndexedDB write) is only needed once per page,
		// not on every scroll-driven progress tick — guard so autoscroll doesn't fire
		// dozens of writes/sec and stutter the main thread.
		const pageKey = `${section.chapter.id}-${pageIdx}`;
		if (pageKey === lastReportedPageKey) return;
		lastReportedPageKey = pageKey;
		const isRead = pageIdx >= section.pages.length - 1;
		updateChapterProgress(section.chapter.id, pageIdx, isRead).catch(() => {});
		if (isRead) markChapterReadLocally(section.chapter.id);
		localData.recordHistory({
			chapterId: section.chapter.id,
			mangaId,
			mangaTitle,
			thumbnailUrl: mangaThumb,
			chapterName: section.chapter.name,
			lastPage: pageIdx,
			isRead,
			sourceId: mangaSourceId,
			chapterNumber: section.chapter.chapterNumber,
			totalPages: section.pages.length
		});
		readingTimer.pingActivity();
		void readingTimer.flush();
	}

	async function handleNearEnd() {
		if (loadingNextChapter || !nextUnloadedChapter) return;
		loadingNextChapter = true;
		try {
			const nextPages = (await fetchChapterPages(nextUnloadedChapter.id)).map((p) => apiUrl(p));
			sections = [...sections, { chapter: nextUnloadedChapter, pages: nextPages }];
		} catch {
			// silent — user can navigate manually
		} finally {
			loadingNextChapter = false;
		}
	}

	// Keep at most one chapter of scrollback loaded behind the one the reader is
	// currently on — otherwise `sections` (and the DOM/images under it) grows
	// without bound the longer someone keeps scrolling through a series.
	// Dropping content that's above the viewport shrinks scrollHeight, so we
	// compensate scrollTop by the removed amount to avoid a visible jump.
	$effect(() => {
		const idx = sections.findIndex((s) => s.chapter.id === currentChapterId);
		if (idx <= 1) return;
		const dropCount = idx - 1;
		// Anchor on the first page of the section that survives the prune (not
		// document.scrollHeight) — the whole-page height is unreliable here since
		// a newly-appended next chapter is likely still loading images below,
		// which would pollute a scrollHeight diff and cause a bogus scroll jump.
		const anchorSelector = `[data-page-key="${sections[dropCount].chapter.id}-0"]`;
		const topBefore = document.querySelector(anchorSelector)?.getBoundingClientRect().top;
		sections = sections.slice(dropCount);
		tick().then(() => {
			if (topBefore === undefined) return;
			const topAfter = document.querySelector(anchorSelector)?.getBoundingClientRect().top;
			if (topAfter === undefined) return;
			const delta = topAfter - topBefore;
			if (delta !== 0) window.scrollBy(0, delta);
		});
	});

	function toggleChrome() {
		// While auto-scrolling, a tap should stop the scroll (expected reflex) rather
		// than toggle the chrome — reveal controls so the user can restart/adjust.
		if (autoScroll) {
			autoScroll = false;
			chromeVisible = true;
			return;
		}
		chromeVisible = !chromeVisible;
	}

	function makeStubChapter(id: number): Chapter {
		return {
			id,
			name: 'Chapter',
			chapterNumber: 0,
			isRead: false,
			isDownloaded: false,
			lastPageRead: 0,
			uploadDate: '',
			sourceOrder: 0
		};
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
	// autoscroll doesn't trip the 5-min idle cutoff mid-stream.
	$effect(() => {
		if (typeof window === 'undefined') return;
		const onActivity = () => readingTimer.pingActivity();
		window.addEventListener('scroll', onActivity, { passive: true });
		window.addEventListener('keydown', onActivity);
		window.addEventListener('touchstart', onActivity, { passive: true });
		window.addEventListener('pointerdown', onActivity);
		return () => {
			window.removeEventListener('scroll', onActivity);
			window.removeEventListener('keydown', onActivity);
			window.removeEventListener('touchstart', onActivity);
			window.removeEventListener('pointerdown', onActivity);
		};
	});

	// $effect reruns whenever chapterId changes (client-side nav between chapters).
	$effect(() => {
		const id = chapterId;
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
		currentPage = 0;
		initialPage = untrack(() => localData.history.find((h) => h.chapterId === id)?.lastPage ?? 0);
		currentChapterId = id;
		currentPageIdx = 0;
		currentPageProgress = 0;
		currentChapterProgress = 0;
		loadingNextChapter = false;

		async function load() {
			try {
				if (!isOnline()) {
					const cached = await getCachedPageUrls(id);
					if (cancelled) return;
					if (cached?.length) {
						pages = cached;
						offlineMode = true;
						sections = [{ chapter: makeStubChapter(id), pages: cached }];
						return;
					}
					throw new Error('Offline — chapter belum disimpan di perangkat.');
				}

				const fetchedPages = (await fetchChapterPages(id)).map((p) => apiUrl(p));
				if (cancelled) return;
				pages = fetchedPages;

				const resolvedMangaId = await resolveMangaId(id);
				if (cancelled) return;
				mangaId = resolvedMangaId;

				if (resolvedMangaId) {
					const fetchedChapters = await getMangaChapters(resolvedMangaId);
					if (cancelled) return;
					chapters = fetchedChapters;
					current = chapters.find((c) => c.id === id) ?? null;
				}

				sections = [{ chapter: current ?? makeStubChapter(id), pages }];
				if (initialPage > 0 && initialPage < pages.length) {
					currentPage = initialPage;
				} else {
					document.documentElement.scrollTop = 0;
				}
				if (pages.length > 0) updateChapterProgress(id, currentPage, false).catch(() => {});
			} catch (e) {
				if (cancelled) return;
				const cached = await getCachedPageUrls(id);
				if (cancelled) return;
				if (cached?.length) {
					pages = cached;
					offlineMode = true;
					sections = [{ chapter: makeStubChapter(id), pages: cached }];
					if (initialPage > 0 && initialPage < cached.length) {
						currentPage = initialPage;
					}
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
			stopTimer();
		};
	});

	async function resolveMangaId(id: number): Promise<number | null> {
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
		if (ch?.manga) {
			mangaTitle = ch.manga.title ?? '';
			mangaThumb = ch.manga.thumbnailUrl ? apiUrl(ch.manga.thumbnailUrl) : null;
			mangaSourceId = ch.manga.sourceId ?? null;
		}
		return ch?.mangaId ?? null;
	}
</script>

<section class="relative min-h-dvh w-full {bgClass} {chapters.length > 0 ? 'lg:pr-72' : ''}">
	{#if loading}
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
			<p class="mt-4 text-sm text-white/70">
				<a href="/downloads" class="text-accent hover:underline">Lihat chapter offline</a>
				<span class="mx-2 text-white/30">·</span>
				<a href={backHref} class="text-accent hover:underline">Kembali</a>
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
				double={readerSettings.mode === 'double'}
				doubleOffset={readerSettings.doubleOffset}
				fit={readerSettings.fit}
				zoom={readerSettings.zoom}
				direction={readerSettings.direction}
				onpage={reportPage}
				ontoggle={toggleChrome}
				onnext={() => nextChapter && goto(`/read/${nextChapter.id}`)}
				onprev={() => prevChapter && goto(`/read/${prevChapter.id}`)}
				onzoom={(z) => readerSettings.set('zoom', z)}
			/>
		{:else}
			<button type="button" class="block w-full cursor-default text-left" onclick={toggleChrome}>
				<WebtoonView
					{sections}
					zoom={readerSettings.zoom}
					gap={readerSettings.gap}
					onpage={reportWebtoonPage}
					onnearend={handleNearEnd}
					{initialPage}
				/>
			</button>
			{#if loadingNextChapter}
				<div class="flex items-center justify-center py-8 text-white/50">
					<Spinner size={20} />
				</div>
			{/if}
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
			{offlineMode}
			{scrollProgress}
			{chapters}
			currentChapterId={viewedChapterId}
			onsettings={() => (settingsOpen = true)}
			onseek={reportPage}
			autoScroll={!isPaged ? autoScroll : undefined}
			{autoScrollSpeed}
			onautoscroll={!isPaged ? () => { autoScroll = !autoScroll; if (autoScroll) chromeVisible = false; } : undefined}
			onautoscrollspeed={!isPaged ? (d) => (autoScrollSpeed = Math.min(8, Math.max(0.5, +(autoScrollSpeed + d).toFixed(1)))) : undefined}
		/>

		<ReaderSettings bind:open={settingsOpen} />

	{/if}
</section>
