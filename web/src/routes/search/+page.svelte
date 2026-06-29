<script lang="ts">
	import { onMount } from 'svelte';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import { fetchSourceManga, getInstalledSources } from '$lib/graphql/api';
	import type { Manga, Source } from '$lib/graphql/types';

	let sources = $state<Source[]>([]);
	let sourceId = $state('');
	let query = $state('');
	let mangas = $state<Manga[]>([]);
	let loading = $state(false);
	let searched = $state(false);
	let error = $state('');

	onMount(async () => {
		try {
			sources = await getInstalledSources(false);
			if (sources[0]) sourceId = sources[0].id;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat source';
		}
	});

	async function search() {
		if (!sourceId || !query.trim()) return;
		loading = true;
		searched = true;
		error = '';
		try {
			const result = await fetchSourceManga(sourceId, 'SEARCH', 1, query.trim());
			mangas = result.mangas;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal mencari';
		} finally {
			loading = false;
		}
	}
</script>

<section>
	<h1 class="mb-6 text-2xl font-semibold">Search</h1>

	<form
		class="mb-6 flex flex-wrap gap-3"
		onsubmit={(e) => {
			e.preventDefault();
			search();
		}}
	>
		<select
			bind:value={sourceId}
			class="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
		>
			{#each sources as source}
				<option value={source.id}>{source.name}</option>
			{/each}
		</select>
		<input
			type="search"
			placeholder="Cari judul manga..."
			bind:value={query}
			class="min-w-[220px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
		/>
		<button
			type="submit"
			class="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
			disabled={loading || !query.trim() || !sourceId}
		>
			{loading ? 'Mencari...' : 'Cari'}
		</button>
	</form>

	{#if sources.length === 0}
		<p class="text-muted">
			Belum ada source. <a href="/extensions" class="text-accent hover:underline">Install extension</a> dulu.
		</p>
	{/if}

	{#if error}
		<div class="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if searched && !loading && mangas.length === 0}
		<p class="text-muted">Tidak ditemukan untuk "{query}".</p>
	{:else if mangas.length > 0}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{#each mangas as manga (manga.id)}
				<MangaCard {manga} href="/manga/{manga.id}" />
			{/each}
		</div>
	{/if}
</section>