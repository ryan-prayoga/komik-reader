<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import MangaGrid from '$lib/components/MangaGrid.svelte';
	import GridSkeleton from '$lib/components/GridSkeleton.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Tabs, Button, EmptyState } from '$lib/components/ui';
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
	<a href="/" class="mb-2 inline-block text-sm text-muted transition hover:text-accent">← Beranda</a>
	<PageHeader title="Jelajahi" subtitle="Komik populer dan terbaru dari source." />

	<Tabs
		class="mb-5"
		active={tab}
		onchange={(v) => setTab(v as FetchMangaType)}
		items={[
			{ value: 'POPULAR', label: 'Populer' },
			{ value: 'LATEST', label: 'Terbaru' }
		]}
	/>

	{#if error}
		<div class="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<GridSkeleton />
	{:else if mangas.length === 0}
		<EmptyState title="Tidak ada hasil" description="Source ini belum mengembalikan komik." />
	{:else}
		<MangaGrid>
			{#each mangas as manga (manga.id)}
				<MangaCard {manga} href="/manga/{manga.id}" />
			{/each}
		</MangaGrid>

		{#if hasNext}
			<div class="mt-8 flex justify-center">
				<Button variant="secondary" loading={loadingMore} onclick={() => load(false)}>
					Muat lebih banyak
				</Button>
			</div>
		{/if}
	{/if}
</section>
