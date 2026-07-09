<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import MangaGrid from '$lib/components/MangaGrid.svelte';
	import GridSkeleton from '$lib/components/GridSkeleton.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Select, EmptyState, Spinner, Chip } from '$lib/components/ui';
	import { fetchBrowseManga, getInstalledSources } from '$lib/graphql/api';
	import { preferences } from '$lib/preferences.svelte';
	import Search from '@lucide/svelte/icons/search';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { BrowseManga, Source } from '$lib/graphql/types';

	const RECENT_KEY = 'komik-search-recent';
	const RECENT_MAX = 8;

	const filterByActive = $derived($page.data.authEnabled && !$page.data.user?.is_admin);

	// sourceId === '' means "Semua source" — fan out the search across every
	// active source instead of hitting Suwayomi's per-source SEARCH endpoint
	// (there is no server-side global search to call).
	let allSources = $state<Source[]>([]);
	let sourceId = $state('');
	let query = $state('');
	let mangas = $state<BrowseManga[]>([]);
	let loading = $state(false);
	let loadingMore = $state(false);
	let searched = $state(false);
	let error = $state('');
	let pageNum = $state(1);
	let hasNext = $state(false);
	let activeQuery = $state('');
	let sentinel = $state<HTMLElement | null>(null);
	let multiProgress = $state({ done: 0, total: 0 });
	let recent = $state<string[]>([]);
	let searchGen = 0;

	type SourceResult = { source: Source; mangas: BrowseManga[] };
	let multiResults = $state<SourceResult[]>([]);
	let multiMode = $state(true);

	const sources = $derived(
		filterByActive && preferences.activePkgNames.length > 0
			? allSources.filter((s) => preferences.activePkgNames.includes(s.extension.pkgName))
			: filterByActive
				? []
				: allSources
	);

	function loadRecent(): string[] {
		if (!browser) return [];
		try {
			const raw = localStorage.getItem(RECENT_KEY);
			const list = raw ? (JSON.parse(raw) as string[]) : [];
			return Array.isArray(list) ? list.filter((s) => typeof s === 'string').slice(0, RECENT_MAX) : [];
		} catch {
			return [];
		}
	}

	function pushRecent(q: string) {
		const next = [q, ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(
			0,
			RECENT_MAX
		);
		recent = next;
		try {
			localStorage.setItem(RECENT_KEY, JSON.stringify(next));
		} catch {
			/* ignore */
		}
	}

	function clearRecent() {
		recent = [];
		try {
			localStorage.removeItem(RECENT_KEY);
		} catch {
			/* ignore */
		}
	}

	function syncUrl(q: string, src: string) {
		const params = new URLSearchParams();
		if (q) params.set('q', q);
		if (src) params.set('source', src);
		const qs = params.toString();
		const href = qs ? `/search?${qs}` : '/search';
		const cur = $page.url.pathname + $page.url.search;
		if (cur !== href) goto(href, { replaceState: true, keepFocus: true, noScroll: true });
	}

	async function search(opts: { fromUrl?: boolean } = {}) {
		const q = query.trim();
		if (!q) return;
		const gen = ++searchGen;
		searched = true;
		error = '';
		activeQuery = q;
		if (!opts.fromUrl) {
			pushRecent(q);
			syncUrl(q, sourceId);
		}

		if (!sourceId) {
			multiMode = true;
			loading = true;
			multiResults = [];
			const targets = sources;
			multiProgress = { done: 0, total: targets.length };
			const CONCURRENCY = 4;
			let idx = 0;
			async function worker() {
				while (idx < targets.length) {
					if (gen !== searchGen) return;
					const src = targets[idx++];
					try {
						const result = await fetchBrowseManga(src.id, 'SEARCH', 1, q);
						if (gen !== searchGen) return;
						if (result.mangas.length) {
							multiResults = [...multiResults, { source: src, mangas: result.mangas }];
						}
					} catch {
						// Skip a source that errors — fan-out continues.
					} finally {
						if (gen === searchGen) {
							multiProgress = {
								done: multiProgress.done + 1,
								total: targets.length
							};
						}
					}
				}
			}
			await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
			if (gen === searchGen) loading = false;
			return;
		}

		multiMode = false;
		loading = true;
		pageNum = 1;
		try {
			const result = await fetchBrowseManga(sourceId, 'SEARCH', 1, q);
			if (gen !== searchGen) return;
			mangas = result.mangas;
			hasNext = result.hasNextPage;
			pageNum = 2;
		} catch (e) {
			if (gen !== searchGen) return;
			error = e instanceof Error ? e.message : 'Gagal mencari';
		} finally {
			if (gen === searchGen) loading = false;
		}
	}

	async function loadMore() {
		if (multiMode || loadingMore || !hasNext || loading || !activeQuery) return;
		loadingMore = true;
		try {
			const result = await fetchBrowseManga(sourceId, 'SEARCH', pageNum, activeQuery);
			mangas = [...mangas, ...result.mangas];
			hasNext = result.hasNextPage;
			pageNum += 1;
		} catch {
			hasNext = false;
		} finally {
			loadingMore = false;
		}
	}

	/** "Lihat semua" on a source's section — switch to single-source search on that source. */
	function searchInSource(id: string) {
		sourceId = id;
		void search();
	}

	function useRecent(q: string) {
		query = q;
		void search();
	}

	onMount(async () => {
		recent = loadRecent();
		const urlQ = $page.url.searchParams.get('q')?.trim() ?? '';
		const urlSrc = $page.url.searchParams.get('source') ?? '';
		if (urlQ) query = urlQ;
		if (urlSrc) sourceId = urlSrc;

		try {
			allSources = await getInstalledSources(preferences.nsfwFilter);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat source';
		}

		if (urlQ) void search({ fromUrl: true });
	});

	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) loadMore();
			},
			{ rootMargin: '200px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

<section>
	<PageHeader title="Cari" subtitle="Telusuri judul dari source terinstall." />

	<form
		class="mb-4 flex flex-wrap items-end gap-3"
		onsubmit={(e) => {
			e.preventDefault();
			void search();
		}}
	>
		<Select bind:value={sourceId} class="w-full sm:w-48" label="Source">
			<option value="">🌐 Semua source</option>
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
		<Button type="submit" loading={loading} disabled={!query.trim() || sources.length === 0}
			>Cari</Button
		>
	</form>

	{#if !searched && recent.length > 0}
		<div class="mb-6">
			<div class="mb-2 flex items-center justify-between">
				<p class="text-xs font-medium uppercase tracking-wide text-muted">Pencarian terakhir</p>
				<button
					type="button"
					class="text-xs text-muted hover:text-accent"
					onclick={clearRecent}
				>
					Hapus
				</button>
			</div>
			<div class="flex flex-wrap gap-2">
				{#each recent as r}
					<Chip onclick={() => useRecent(r)}>{r}</Chip>
				{/each}
			</div>
		</div>
	{/if}

	{#if sources.length === 0}
		<EmptyState
			title="Belum ada source aktif"
			description={filterByActive
				? 'Aktifkan ekstensi dulu untuk mulai mencari.'
				: 'Install ekstensi dulu untuk mulai mencari.'}
		>
			{#snippet action()}<Button href="/extensions">
					{filterByActive ? 'Pilih ekstensi' : 'Install ekstensi'}
				</Button>{/snippet}
		</EmptyState>
	{/if}

	{#if error}
		<div class="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if searched && multiMode}
		{#if loading}
			<p class="mb-4 flex items-center gap-2 text-sm text-muted">
				<Spinner size={14} />
				Mencari… {multiProgress.done}/{multiProgress.total} source
				{#if multiResults.length > 0}
					<span class="text-muted/80">· {multiResults.length} source ada hasil</span>
				{/if}
			</p>
		{/if}
		{#if !loading && multiResults.length === 0}
			<EmptyState
				title="Tidak ditemukan"
				description={`Tidak ada hasil untuk "${activeQuery}" di source manapun.`}
			/>
		{:else if multiResults.length > 0}
			<div class="space-y-8">
				{#each multiResults as group (group.source.id)}
					<section>
						<div class="mb-3 flex items-center justify-between gap-2">
							<h2 class="flex items-center gap-2 text-sm font-semibold text-text">
								{group.source.name}
								<span class="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-normal text-muted">
									{group.mangas.length}{group.mangas.length >= 20 ? '+' : ''}
								</span>
							</h2>
							<button
								type="button"
								onclick={() => searchInSource(group.source.id)}
								class="flex shrink-0 items-center gap-1 text-xs text-accent hover:underline"
							>
								Lihat semua <ChevronRight size={12} />
							</button>
						</div>
						<MangaGrid>
							{#each group.mangas.slice(0, 12) as manga (manga.id)}
								<MangaCard {manga} href="/manga/{manga.id}" showLibraryToggle />
							{/each}
						</MangaGrid>
					</section>
				{/each}
			</div>
		{/if}
	{:else if loading}
		<GridSkeleton />
	{:else if searched && mangas.length === 0 && sources.length > 0}
		<EmptyState title="Tidak ditemukan" description={`Tidak ada hasil untuk "${activeQuery}".`} />
	{:else if mangas.length > 0}
		<MangaGrid>
			{#each mangas as manga (manga.id)}
				<MangaCard {manga} href="/manga/{manga.id}" showLibraryToggle />
			{/each}
		</MangaGrid>

		<div bind:this={sentinel} class="h-1"></div>
		{#if loadingMore}
			<div class="flex justify-center py-8 text-muted"><Spinner size={22} /></div>
		{/if}
	{/if}
</section>
