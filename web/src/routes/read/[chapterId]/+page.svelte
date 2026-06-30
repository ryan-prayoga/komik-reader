<script lang="ts">
	import { page } from '$app/stores';
	import { untrack } from 'svelte';
	import { apiUrl } from '$lib/graphql/client';
	import { fetchChapterPages, getMangaChapters, updateChapterProgress } from '$lib/graphql/api';
	import { isOnline } from '$lib/offline/connection.svelte';
	import { getCachedPageUrls } from '$lib/offline/cache';
	import { readerSettings, BG_CLASS } from '$lib/reader-settings.svelte';
	import { localData } from '$lib/local/data.svelte';
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
	let currentSectionIdx = $state(0);
	let currentPageIdx = $state(0);
	let currentPageProgress = $state(0); // 0–1 scroll progress within the current page
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
		const speed = autoScrollSpeed;
		function step() {
			window.scrollBy(0, speed);
			rafId = requestAnimationFrame(step);
		}
		rafId = requestAnimationFrame(step);
		return () => cancelAnimationFrame(rafId);
	});

	$effect(() => {
		readerSettings.set('autoScrollSpeed', autoScrollSpeed);
	});

	const bgClass = $derived(BG_CLASS[readerSettings.bg]);
	const isPaged = $derived(readerSettings.mode !== 'webtoon');
	const backHref = $derived(mangaId ? `/manga/${mangaId}` : '/history');

	// Navigation index: paged uses stable URL chapterId (same as original),
	// webtoon uses currently-viewed section to update nav when infinite-scrolling.
	const navChapterIndex = $derived.by(() => {
		if (isPaged) return chapters.findIndex((c) => c.id === chapterId);
		const secChapter = sections[currentSectionIdx]?.chapter;
		if (!secChapter) return chapters.findIndex((c) => c.id === chapterId);
		return chapters.findIndex((c) => c.id === secChapter.id);
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
	const viewedChapterId = $derived(sections[currentSectionIdx]?.chapter.id ?? chapterId);
	const viewedChapterName = $derived(
		sections[currentSectionIdx]?.chapter.name ?? current?.name ?? ''
	);

	// Reading progress (0–1) for the thin top bar.
	// Webtoon: sub-page precision via currentPageProgress (scroll position within page).
	const scrollProgress = $derived.by(() => {
		if (isPaged) {
			return pages.length > 0 ? (currentPage + 1) / pages.length : 0;
		}
		const section = sections[currentSectionIdx];
		if (!section?.pages.length) return 0;
		return (currentPageIdx + currentPageProgress) / section.pages.length;
	});

	const pageLabel = $derived(
		isPaged
			? `${currentPage + 1} / ${pages.length}`
			: `${sections[currentSectionIdx]?.pages.length ?? pages.length} halaman`
	);

	function reportPage(index: number) {
		currentPage = index;
		updateChapterProgress(chapterId, index, index >= pages.length - 1).catch(() => {});
		if (mangaId) {
			localData.recordHistory({
				chapterId,
				mangaId,
				mangaTitle,
				thumbnailUrl: mangaThumb,
				chapterName: current?.name ?? 'Chapter',
				lastPage: index,
				isRead: index >= pages.length - 1,
				sourceId: mangaSourceId,
				chapterNumber: current?.chapterNumber,
				totalPages: pages.length
			});
		}
	}

	function reportWebtoonPage(sectionIdx: number, pageIdx: number, pageProgress: number) {
		currentSectionIdx = sectionIdx;
		currentPageIdx = pageIdx;
		currentPageProgress = pageProgress;
		const section = sections[sectionIdx];
		if (!section || !mangaId) return;
		const isRead = pageIdx >= section.pages.length - 1;
		updateChapterProgress(section.chapter.id, pageIdx, isRead).catch(() => {});
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

	function toggleChrome() {
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

	// $effect reruns whenever chapterId changes (client-side nav between chapters).
	$effect(() => {
		const id = chapterId;
		let cancelled = false;

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
		currentSectionIdx = 0;
		currentPageIdx = 0;
		currentPageProgress = 0;
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

<section class="relative min-h-screen w-full {bgClass}">
	{#if loading}
		<div class="flex min-h-screen flex-col">
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
				fit={readerSettings.fit}
				zoom={readerSettings.zoom}
				onpage={reportPage}
				ontoggle={toggleChrome}
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
