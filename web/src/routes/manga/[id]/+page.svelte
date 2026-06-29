<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { apiUrl } from '$lib/graphql/client';
	import { fetchChapters, fetchMangaDetail } from '$lib/graphql/api';
	import type { Chapter, MangaDetail } from '$lib/graphql/types';

	const mangaId = $derived(Number($page.params.id));

	let manga = $state<MangaDetail | null>(null);
	let chapters = $state<Chapter[]>([]);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			manga = await fetchMangaDetail(mangaId);
			chapters = await fetchChapters(mangaId);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat detail manga';
		} finally {
			loading = false;
		}
	});

	function formatDate(ts: string) {
		const n = Number(ts);
		if (!n) return '';
		return new Date(n).toLocaleDateString('id-ID');
	}
</script>

<section>
	{#if loading}
		<p class="text-muted">Memuat detail...</p>
	{:else if error}
		<div class="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>
	{:else if manga}
		<div class="mb-8 flex flex-col gap-6 md:flex-row">
			<div class="mx-auto w-48 shrink-0 overflow-hidden rounded-xl border border-border bg-surface md:mx-0">
				{#if manga.thumbnailUrl}
					<img src={apiUrl(manga.thumbnailUrl)} alt={manga.title} class="w-full" />
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				<h1 class="text-2xl font-semibold leading-tight">{manga.title}</h1>
				{#if manga.author}
					<p class="mt-2 text-sm text-muted">Author: {manga.author}</p>
				{/if}
				{#if manga.artist}
					<p class="text-sm text-muted">Artist: {manga.artist}</p>
				{/if}
				{#if manga.genre?.length}
					<div class="mt-3 flex flex-wrap gap-2">
						{#each manga.genre as g}
							<span class="rounded-full bg-surface px-2 py-1 text-xs text-muted">{g}</span>
						{/each}
					</div>
				{/if}
				{#if manga.description}
					<p class="mt-4 text-sm leading-relaxed text-muted whitespace-pre-line">
						{manga.description}
					</p>
				{/if}
			</div>
		</div>

		<h2 class="mb-4 text-lg font-medium">Chapters ({chapters.length})</h2>
		{#if chapters.length === 0}
			<p class="text-muted">Belum ada chapter.</p>
		{:else}
			<div class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
				{#each chapters as chapter (chapter.id)}
					<a
						href="/read/{chapter.id}"
						class="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-surface-hover"
					>
						<div>
							<p class="text-sm font-medium">{chapter.name}</p>
							<p class="text-xs text-muted">
								{#if formatDate(chapter.uploadDate)}{formatDate(chapter.uploadDate)}{/if}
								{#if chapter.isRead} · Read{/if}
							</p>
						</div>
						<span class="text-muted">→</span>
					</a>
				{/each}
			</div>
		{/if}
	{/if}
</section>