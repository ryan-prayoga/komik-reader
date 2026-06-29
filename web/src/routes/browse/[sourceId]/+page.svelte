<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import { fetchSourceManga } from '$lib/graphql/api';
	import type { FetchMangaType, Manga } from '$lib/graphql/types';

	const sourceId = $derived($page.params.sourceId ?? '');

	let tab = $state<FetchMangaType>('POPULAR');
	let mangas = $state<Manga[]>([]);
	let pageNum = $state(1);
	let hasNext = $state(false);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state('');

	async function load(reset = true) {
		if (reset) {
			loading = true;
			pageNum = 1;
		} else {
			loadingMore = true;
		}
		error = '';

		try {
			const result = await fetchSourceManga(sourceId, tab, reset ? 1 : pageNum);
			if (reset) {
				mangas = result.mangas;
				pageNum = 2;
			} else {
				mangas = [...mangas, ...result.mangas];
				pageNum += 1;
			}
			hasNext = result.hasNextPage;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat manga';
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	function setTab(next: FetchMangaType) {
		tab = next;
		load(true);
	}

	onMount(() => load(true));
</script>

<section>
	<div class="mb-6 flex flex-wrap items-center gap-3">
		<a href="/" class="text-sm text-muted hover:text-accent">← Home</a>
		<h1 class="text-xl font-semibold">Browse</h1>
	</div>

	<div class="mb-6 flex gap-2">
		<button
			class="rounded-lg px-4 py-2 text-sm transition {tab === 'POPULAR'
				? 'bg-accent text-white'
				: 'bg-surface text-muted hover:text-text'}"
			onclick={() => setTab('POPULAR')}
		>
			Popular
		</button>
		<button
			class="rounded-lg px-4 py-2 text-sm transition {tab === 'LATEST'
				? 'bg-accent text-white'
				: 'bg-surface text-muted hover:text-text'}"
			onclick={() => setTab('LATEST')}
		>
			Latest
		</button>
	</div>

	{#if error}
		<div class="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<p class="text-muted">Memuat manga...</p>
	{:else if mangas.length === 0}
		<p class="text-muted">Tidak ada hasil.</p>
	{:else}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{#each mangas as manga (manga.id)}
				<MangaCard {manga} href="/manga/{manga.id}" />
			{/each}
		</div>

		{#if hasNext}
			<div class="mt-8 flex justify-center">
				<button
					class="rounded-lg border border-border bg-surface px-6 py-2 text-sm hover:border-accent disabled:opacity-50"
					disabled={loadingMore}
					onclick={() => load(false)}
				>
					{loadingMore ? 'Memuat...' : 'Muat lebih banyak'}
				</button>
			</div>
		{/if}
	{/if}
</section>