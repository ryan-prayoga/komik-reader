<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { apiUrl } from '$lib/graphql/client';
	import {
		fetchChapterPages,
		getMangaChapters,
		updateChapterProgress
	} from '$lib/graphql/api';
	import type { Chapter } from '$lib/graphql/types';

	const chapterId = $derived(Number($page.params.chapterId));

	let pages = $state<string[]>([]);
	let chapters = $state<Chapter[]>([]);
	let current = $state<Chapter | null>(null);
	let mangaId = $state<number | null>(null);
	let loading = $state(true);
	let error = $state('');

	const currentIndex = $derived(chapters.findIndex((c) => c.id === chapterId));
	const prevChapter = $derived(currentIndex > 0 ? chapters[currentIndex - 1] : null);
	const nextChapter = $derived(
		currentIndex >= 0 && currentIndex < chapters.length - 1
			? chapters[currentIndex + 1]
			: null
	);

	async function resolveMangaId(id: number): Promise<number | null> {
		const res = await fetch('/api/graphql', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: `query($id: Int!) { chapter(id: $id) { mangaId name } }`,
				variables: { id }
			})
		});
		const json = await res.json();
		return json?.data?.chapter?.mangaId ?? null;
	}

	function onPageVisible(index: number) {
		updateChapterProgress(chapterId, index, index >= pages.length - 1).catch(() => {});
	}

	function observePage(node: HTMLElement, index: number) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) onPageVisible(index);
			},
			{ threshold: 0.5 }
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	onMount(async () => {
		try {
			pages = await fetchChapterPages(chapterId);
			const resolvedMangaId = await resolveMangaId(chapterId);
			mangaId = resolvedMangaId;
			if (resolvedMangaId) {
				chapters = await getMangaChapters(resolvedMangaId);
				current = chapters.find((c) => c.id === chapterId) ?? null;
			}
			if (pages.length > 0) {
				await updateChapterProgress(chapterId, 0, false);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat reader';
		} finally {
			loading = false;
		}
	});
</script>

<section class="mx-auto max-w-3xl">
	{#if loading}
		<p class="text-center text-muted">Memuat chapter...</p>
	{:else if error}
		<div class="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>
	{:else}
		<div class="sticky top-14 z-40 mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 backdrop-blur">
			<div class="min-w-0">
				<p class="truncate text-sm font-medium">{current?.name ?? 'Chapter'}</p>
				<p class="text-xs text-muted">{pages.length} halaman</p>
			</div>
			<div class="flex shrink-0 gap-2">
				{#if mangaId}
					<a href="/manga/{mangaId}" class="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent">Detail</a>
				{/if}
				{#if prevChapter}
					<a href="/read/{prevChapter.id}" class="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent">Prev</a>
				{/if}
				{#if nextChapter}
					<a href="/read/{nextChapter.id}" class="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent">Next</a>
				{/if}
			</div>
		</div>

		<div class="space-y-1">
			{#each pages as pageUrl, i}
				<div class="overflow-hidden bg-black" use:observePage={i}>
					<img
						src={apiUrl(pageUrl)}
						alt="Page {i + 1}"
						class="mx-auto block w-full"
						loading="lazy"
					/>
				</div>
			{/each}
		</div>
	{/if}
</section>