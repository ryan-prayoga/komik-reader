<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import MangaGrid from '$lib/components/MangaGrid.svelte';
	import GridSkeleton from '$lib/components/GridSkeleton.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Select, EmptyState } from '$lib/components/ui';
	import { fetchSourceManga, getInstalledSources } from '$lib/graphql/api';
	import { preferences } from '$lib/preferences.svelte';
	import Search from '@lucide/svelte/icons/search';
	import type { Manga, Source } from '$lib/graphql/types';

	const filterByActive = $derived($page.data.authEnabled && !$page.data.user?.is_admin);

	let allSources = $state<Source[]>([]);
	let sourceId = $state('');
	let query = $state('');
	let mangas = $state<Manga[]>([]);
	let loading = $state(false);
	let searched = $state(false);
	let error = $state('');

	const sources = $derived(
		filterByActive && preferences.activePkgNames.length > 0
			? allSources.filter((s) => preferences.activePkgNames.includes(s.extension.pkgName))
			: filterByActive
				? []
				: allSources
	);

	onMount(async () => {
		try {
			allSources = await getInstalledSources(preferences.nsfwFilter);
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
	<PageHeader title="Cari" subtitle="Telusuri judul dari source terinstall." />

	<form
		class="mb-6 flex flex-wrap items-end gap-3"
		onsubmit={(e) => {
			e.preventDefault();
			search();
		}}
	>
		<Select bind:value={sourceId} class="w-full sm:w-48" label="Source">
			{#each sources as source}
				<option value={source.id}>{source.name}</option>
			{/each}
		</Select>
		<div class="relative min-w-[220px] flex-1">
			<Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
			<input
				type="search"
				placeholder="Cari judul manga..."
				bind:value={query}
				class="w-full rounded-[var(--radius)] border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus:border-accent"
			/>
		</div>
		<Button type="submit" loading={loading} disabled={!query.trim() || !sourceId}>Cari</Button>
	</form>

	{#if sources.length === 0}
		<EmptyState
			title="Belum ada source aktif"
			description={filterByActive
				? 'Aktifkan extension dulu untuk mulai mencari.'
				: 'Install extension dulu untuk mulai mencari.'}
		>
			{#snippet action()}<Button href="/extensions">
				{filterByActive ? 'Pilih Extension' : 'Install extension'}
			</Button>{/snippet}
		</EmptyState>
	{/if}

	{#if error}
		<div class="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<GridSkeleton />
	{:else if searched && mangas.length === 0 && sources.length > 0}
		<EmptyState title="Tidak ditemukan" description={`Tidak ada hasil untuk "${query}".`} />
	{:else if mangas.length > 0}
		<MangaGrid>
			{#each mangas as manga (manga.id)}
				<MangaCard {manga} href="/manga/{manga.id}" />
			{/each}
		</MangaGrid>
	{/if}
</section>
