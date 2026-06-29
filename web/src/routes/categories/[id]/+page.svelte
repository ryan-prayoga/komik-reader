<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import { getCategories, getCategoryManga } from '$lib/graphql/api';
	import type { Manga } from '$lib/graphql/types';

	const categoryId = $derived(Number($page.params.id));

	let categoryName = $state('');
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
	<div class="mb-6">
		<a href="/categories" class="text-sm text-muted hover:text-accent">← Categories</a>
		<h1 class="mt-2 text-2xl font-semibold">{categoryName}</h1>
		<p class="mt-1 text-sm text-muted">{mangas.length} manga</p>
	</div>

	{#if error}
		<div class="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<p class="text-muted">Memuat...</p>
	{:else if mangas.length === 0}
		<p class="text-muted">Tidak ada manga di kategori ini.</p>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
			{#each mangas as manga (manga.id)}
				<MangaCard {manga} href="/manga/{manga.id}" />
			{/each}
		</div>
	{/if}
</section>