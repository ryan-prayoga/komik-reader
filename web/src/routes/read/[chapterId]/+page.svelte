<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
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

	let pages = $state<string[]>([]);
	let chapters = $state<Chapter[]>([]);
	let current = $state<Chapter | null>(null);
	let mangaId = $state<number | null>(null);
	let mangaTitle = $state('');
	let mangaThumb = $state<string | null>(null);
	let mangaSourceId = $state<string | null>(null);
	let loading = $state(true);
	let error = $state('');
	let offlineMode = $state(false);

	let currentPage = $state(0);
	let chromeVisible = $state(true);
	let settingsOpen = $state(false);

	const currentIndex = $derived(chapters.findIndex((c) => c.id === chapterId));
	const prevChapter = $derived(currentIndex > 0 ? chapters[currentIndex - 1] : null);
	const nextChapter = $derived(
		currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null
	);

	const bgClass = $derived(BG_CLASS[readerSettings.bg]);
	const isPaged = $derived(readerSettings.mode !== 'webtoon');
	const backHref = $derived(mangaId ? `/manga/${mangaId}` : '/history');
	const pageLabel = $derived(
		isPaged ? `${currentPage + 1} / ${pages.length}` : `${pages.length} halaman`
	);

	function reportPage(index: number) {
		currentPage = index;
		// Server progress (logged-in/owner) — best effort; guests get 401, ignored.
		updateChapterProgress(chapterId, index, index >= pages.length - 1).catch(() => {});
		// Local-first reading history — works for everyone, syncs if logged in.
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
				chapterNumber: current?.chapterNumber
			});
		}
	}

	function toggleChrome() {
		chromeVisible = !chromeVisible;
	}

	onMount(async () => {
		try {
			if (!isOnline()) {
				const cached = await getCachedPageUrls(chapterId);
				if (cached?.length) {
					pages = cached;
					offlineMode = true;
					return;
				}
				throw new Error('Offline — chapter belum disimpan di perangkat.');
			}

			pages = (await fetchChapterPages(chapterId)).map((p) => apiUrl(p));
			const resolvedMangaId = await resolveMangaId(chapterId);
			mangaId = resolvedMangaId;
			if (resolvedMangaId) {
				chapters = await getMangaChapters(resolvedMangaId);
				current = chapters.find((c) => c.id === chapterId) ?? null;
			}
			if (pages.length > 0) await updateChapterProgress(chapterId, 0, false);
		} catch (e) {
			const cached = await getCachedPageUrls(chapterId);
			if (cached?.length) {
				pages = cached;
				offlineMode = true;
			} else {
				error = e instanceof Error ? e.message : 'Gagal memuat reader';
			}
		} finally {
			loading = false;
		}
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
		<div class="flex min-h-screen items-center justify-center text-white/70">
			<Spinner size={28} />
		</div>
	{:else if error}
		<div class="mx-auto max-w-md px-4 py-20 text-center">
			<div class="rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
				{error}
			</div>
			<p class="mt-4 text-sm text-white/70">
				<a href="/offline" class="text-accent hover:underline">Lihat chapter offline</a>
				<span class="mx-2 text-white/30">·</span>
				<a href={backHref} class="text-accent hover:underline">Kembali</a>
			</p>
		</div>
	{:else}
		<!-- Brightness overlay (non-interactive) -->
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
				<WebtoonView {pages} zoom={readerSettings.zoom} gap={readerSettings.gap} onpage={reportPage} />
			</button>
		{/if}

		<ReaderControls
			show={chromeVisible}
			title={current?.name ?? 'Chapter'}
			{pageLabel}
			{backHref}
			prevHref={prevChapter ? `/read/${prevChapter.id}` : null}
			nextHref={nextChapter ? `/read/${nextChapter.id}` : null}
			showSlider={isPaged}
			bind:current={currentPage}
			max={pages.length - 1}
			{offlineMode}
			onsettings={() => (settingsOpen = true)}
			onseek={reportPage}
		/>

		<ReaderSettings bind:open={settingsOpen} />
	{/if}
</section>
