<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import MangaGrid from '$lib/components/MangaGrid.svelte';
	import GridSkeleton from '$lib/components/GridSkeleton.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { EmptyState } from '$lib/components/ui';
	import { getCategories, getCategoryManga } from '$lib/graphql/api';
	import type { Manga } from '$lib/graphql/types';

	const categoryId = $derived(Number($page.params.id));

	let categoryName = $state('Kategori');
	let mangas = $state<Manga[]>([]);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			const [categories, items] = await Promise.all([
				getCategories(),
				getCategoryManga(categoryId)
			]);
			categoryName = categories.find((c) => c.id === categoryId)?.name ?? 'Kategori';
			mangas = items;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat kategori';
		} finally {
			loading = false;
		}
	});
</script>

<section>
	<a href="/categories" class="mb-2 inline-block text-sm text-muted transition hover:text-accent">
		← Kategori
	</a>
	<PageHeader title={categoryName} subtitle={`${mangas.length} manga`} />

	{#if error}
		<div class="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<GridSkeleton />
	{:else if mangas.length === 0}
		<EmptyState title="Kategori kosong" description="Belum ada manga di kategori ini." />
	{:else}
		<MangaGrid>
			{#each mangas as manga (manga.id)}
				<MangaCard {manga} href="/manga/{manga.id}" />
			{/each}
		</MangaGrid>
	{/if}
</section>
