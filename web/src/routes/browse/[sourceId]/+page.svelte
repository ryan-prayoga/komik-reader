<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import MangaGrid from '$lib/components/MangaGrid.svelte';
	import GridSkeleton from '$lib/components/GridSkeleton.svelte';
	import { Tabs, Button, EmptyState, Select, Badge, Chip, Sheet, Spinner } from '$lib/components/ui';
	import { fetchBrowseManga, getMangasDetail, getSourceById, getSourceFilters } from '$lib/graphql/api';
	import { getCached, getMissingIds, setCache } from '$lib/stores/mangaDetailCache';
	import { getBrowseSnapshot, saveBrowseSnapshot } from '$lib/stores/browseCache';
	import { apiUrl } from '$lib/graphql/client';
	import { localData } from '$lib/local/data.svelte';
	import type {
		BrowseManga,
		FetchMangaType,
		FilterChangeInput,
		Source,
		SourceFilter,
		TriState
	} from '$lib/graphql/types';
	import SearchIcon from '@lucide/svelte/icons/search';
	import Globe from '@lucide/svelte/icons/globe';
	import X from '@lucide/svelte/icons/x';
	import Puzzle from '@lucide/svelte/icons/puzzle';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Check from '@lucide/svelte/icons/check';
	import Minus from '@lucide/svelte/icons/minus';

	const sourceId = $derived($page.params.sourceId ?? '');

	let source = $state<(Source & { baseUrl?: string }) | null>(null);
	let tab = $state<FetchMangaType>('POPULAR');
	let mangas = $state<BrowseManga[]>([]);
	let pageNum = $state(1);
	let hasNext = $state(false);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state('');
	let enrichGen = 0;
	let sentinel = $state<HTMLElement | null>(null);


	let searchInput = $state('');
	let activeSearch = $state('');

	let filterLib = $state<'all' | 'in_library' | 'not_in_library'>('all');
	let filterOpen = $state(false);
	let sourceFilters = $state<SourceFilter[]>([]);
	let uiFilters = $state<SourceFilter[]>([]);
	let appliedFilters = $state<FilterChangeInput[]>([]);

	function cloneFilters(filters: SourceFilter[]): SourceFilter[] {
		return JSON.parse(JSON.stringify(filters));
	}

	function filtersToInput(filters: SourceFilter[]): FilterChangeInput[] {
		const inputs: FilterChangeInput[] = [];
		filters.forEach((filter, position) => {
			if (filter.__typename === 'CheckBoxFilter' && filter.state) {
				inputs.push({ position, checkBoxState: true });
			} else if (filter.__typename === 'SelectFilter' && filter.state !== 0) {
				inputs.push({ position, selectState: filter.state });
			} else if (filter.__typename === 'TriStateFilter' && filter.state !== 'IGNORED') {
				inputs.push({ position, triState: filter.state });
			} else if (filter.__typename === 'SortFilter' && filter.state) {
				inputs.push({ position, sortState: filter.state });
			} else if (filter.__typename === 'TextFilter' && filter.state) {
				inputs.push({ position, textState: filter.state });
			} else if (filter.__typename === 'GroupFilter') {
				const groupInputs: FilterChangeInput[] = [];
				filter.filters.forEach((child, ci) => {
					if (child.__typename === 'CheckBoxFilter' && child.state) {
						groupInputs.push({ position: ci, checkBoxState: true });
					} else if (child.__typename === 'TriStateFilter' && child.state !== 'IGNORED') {
						groupInputs.push({ position: ci, triState: child.state });
					} else if (child.__typename === 'SelectFilter' && child.state !== 0) {
						groupInputs.push({ position: ci, selectState: child.state });
					} else if (child.__typename === 'TextFilter' && child.state) {
						groupInputs.push({ position: ci, textState: child.state });
					}
				});
				if (groupInputs.length) inputs.push({ position, groupState: groupInputs });
			}
		});
		return inputs;
	}

	function countActiveFilters(filters: FilterChangeInput[]): number {
		let count = 0;
		for (const f of filters) {
			if (f.groupState) count += f.groupState.length;
			else count += 1;
		}
		return count;
	}

	const activeFilterCount = $derived(countActiveFilters(appliedFilters));

	function applyEnrichment(list: BrowseManga[]): BrowseManga[] {
		return list.map((m) => {
			const c = getCached(m.id);
			if (!c) return m;
			return {
				...m,
				status: c.status || m.status,
				genre: c.genre.length ? c.genre : (m.genre ?? []),
				latestUploadedChapter: c.latestUploadedChapter ?? m.latestUploadedChapter
			};
		});
	}

	/** DB-only polish for genre/status/latest chapter. Never scrapes source
	 *  (no fetchChapters / fetchMangaDetail) — avoids N+1 Suwayomi source hits. */
	async function enrichInBackground(list: BrowseManga[], gen: number) {
		const notCached = getMissingIds(list.map((m) => m.id));
		if (!notCached.length) return;

		const dbResults = await getMangasDetail(notCached);
		for (const d of dbResults) {
			setCache(d.id, {
				status: d.status,
				genre: d.genre,
				latestUploadedChapter: d.latestUploadedChapter,
				chaptersChecked: d.latestUploadedChapter !== null
			});
		}
		if (gen !== enrichGen) return;
		mangas = applyEnrichment(mangas);
	}

	async function load(reset = true) {
		if (reset) {
			loading = true;
			pageNum = 1;
		} else {
			if (loadingMore || !hasNext) return;
			loadingMore = true;
		}
		error = '';
		if (reset) {
			enrichGen++;
		}
		const gen = enrichGen;

		const type: FetchMangaType = activeSearch ? 'SEARCH' : tab;

		try {
			const result = await fetchBrowseManga(sourceId, type, reset ? 1 : pageNum, activeSearch, appliedFilters);
			const enriched = applyEnrichment(result.mangas);
			if (reset) {
				mangas = enriched;
				pageNum = 2;
			} else {
				mangas = [...mangas, ...enriched];
				pageNum += 1;
			}
			hasNext = result.hasNextPage;
				// Batch Suwayomi DB only — no per-card source scrape (dataSaver-safe).
				void enrichInBackground(result.mangas, gen);
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

	function doSearch() {
		activeSearch = searchInput.trim();
		load(true);
	}

	function clearSearch() {
		searchInput = '';
		activeSearch = '';
		load(true);
	}

	function openFilter() {
		uiFilters = cloneFilters(sourceFilters);
		filterOpen = true;
	}

	function applyFilters() {
		sourceFilters = cloneFilters(uiFilters);
		appliedFilters = filtersToInput(sourceFilters);
		filterOpen = false;
		load(true);
	}

	function resetFilters() {
		uiFilters = cloneFilters(sourceFilters.map((f) => resetFilter(f)));
	}

	function resetFilter(f: SourceFilter): SourceFilter {
		if (f.__typename === 'CheckBoxFilter') return { ...f, state: false };
		if (f.__typename === 'SelectFilter') return { ...f, state: 0 };
		if (f.__typename === 'TriStateFilter') return { ...f, state: 'IGNORED' as TriState };
		if (f.__typename === 'SortFilter') return { ...f, state: null };
		if (f.__typename === 'TextFilter') return { ...f, state: '' };
		if (f.__typename === 'GroupFilter')
			return { ...f, filters: f.filters.map((c) => resetFilter(c) as typeof c) };
		return f;
	}

	function updateSort(fi: number, vi: number) {
		const f = uiFilters[fi];
		if (f.__typename !== 'SortFilter') return;
		const cur = f.state;
		const ascending = cur?.index === vi ? !cur.ascending : true;
		uiFilters[fi] = { ...f, state: { index: vi, ascending } };
	}

	function updateSelect(fi: number, vi: number) {
		const f = uiFilters[fi];
		if (f.__typename !== 'SelectFilter') return;
		uiFilters[fi] = { ...f, state: vi };
	}

	function updateGroupSelect(fi: number, ci: number, vi: number) {
		const f = uiFilters[fi];
		if (f.__typename !== 'GroupFilter') return;
		const child = f.filters[ci];
		if (child.__typename !== 'SelectFilter') return;
		const updatedFilters = [...f.filters];
		updatedFilters[ci] = { ...child, state: vi };
		uiFilters[fi] = { ...f, filters: updatedFilters };
	}

	function toggleCheckbox(fi: number) {
		const f = uiFilters[fi];
		if (f.__typename !== 'CheckBoxFilter') return;
		uiFilters[fi] = { ...f, state: !f.state };
	}

	function cycleTriState(fi: number) {
		const f = uiFilters[fi];
		if (f.__typename !== 'TriStateFilter') return;
		const next: TriState =
			f.state === 'IGNORED' ? 'INCLUDE' : f.state === 'INCLUDE' ? 'EXCLUDE' : 'IGNORED';
		uiFilters[fi] = { ...f, state: next };
	}

	function toggleGroupCheckbox(fi: number, ci: number) {
		const f = uiFilters[fi];
		if (f.__typename !== 'GroupFilter') return;
		const child = f.filters[ci];
		if (child.__typename !== 'CheckBoxFilter') return;
		const updatedFilters = [...f.filters];
		updatedFilters[ci] = { ...child, state: !child.state };
		uiFilters[fi] = { ...f, filters: updatedFilters };
	}

	function cycleGroupTriState(fi: number, ci: number) {
		const f = uiFilters[fi];
		if (f.__typename !== 'GroupFilter') return;
		const child = f.filters[ci];
		if (child.__typename !== 'TriStateFilter') return;
		const next: TriState =
			child.state === 'IGNORED' ? 'INCLUDE' : child.state === 'INCLUDE' ? 'EXCLUDE' : 'IGNORED';
		const updatedFilters = [...f.filters];
		updatedFilters[ci] = { ...child, state: next };
		uiFilters[fi] = { ...f, filters: updatedFilters };
	}

	const displayMangas = $derived<BrowseManga[]>(
		mangas.filter((m) => {
			if (filterLib === 'in_library') return localData.isInLibrary(m.id);
			if (filterLib === 'not_in_library') return !localData.isInLibrary(m.id);
			return true;
		})
	);

	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasNext && !loadingMore && !loading) {
					load(false);
				}
			},
			{ rootMargin: '200px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	// Persist the scrolled-through grid so returning from a manga detail (which
	// remounts this route) restores position instead of refetching from page 1.
	beforeNavigate(() => {
		saveBrowseSnapshot({
			sourceId,
			tab,
			activeSearch,
			mangas,
			pageNum,
			hasNext,
			scrollY: window.scrollY,
			appliedFilters
		});
	});

	onMount(() => {
		getSourceById(sourceId).then((s) => (source = s));
		getSourceFilters(sourceId).then((f) => {
			sourceFilters = f;
			uiFilters = cloneFilters(f);
		});

		const snap = getBrowseSnapshot(sourceId);
		if (snap && snap.mangas.length > 0) {
			tab = snap.tab;
			activeSearch = snap.activeSearch;
			searchInput = snap.activeSearch;
			mangas = applyEnrichment(snap.mangas);
			pageNum = snap.pageNum;
			hasNext = snap.hasNext;
			appliedFilters = snap.appliedFilters;
			loading = false;
			tick().then(() => window.scrollTo(0, snap.scrollY));
			return;
		}
		load(true);
	});
</script>

<section>
	<a href="/" class="mb-4 inline-block text-sm text-muted transition hover:text-accent">← Beranda</a>

	<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
		<div class="flex items-center gap-4">
			<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface text-muted">
				{#if source?.iconUrl}
					<img src={apiUrl(source.iconUrl)} alt="" class="h-full w-full object-cover" />
				{:else}
					<Puzzle size={22} />
				{/if}
			</div>
			<div>
				<div class="flex flex-wrap items-center gap-2">
					<h1 class="text-2xl font-semibold tracking-tight text-text">
						{source?.name ?? 'Jelajahi'}
					</h1>
					{#if source}
						<Badge tone="outline">{source.lang.toUpperCase()}</Badge>
						{#if source.isNsfw}<Badge tone="danger">18+</Badge>{/if}
					{/if}
				</div>
				<p class="mt-1 text-sm text-muted">Komik populer dan terbaru dari source.</p>
			</div>
		</div>
		{#if source?.baseUrl}
			<Button variant="secondary" size="sm" href={source.baseUrl} target="_blank" rel="noopener noreferrer">
				<Globe size={15} /> Buka Website
			</Button>
		{/if}
	</div>

	<form
		class="mb-4 flex gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			doSearch();
		}}
	>
		<div class="relative flex-1">
			<SearchIcon size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
			<input
				type="search"
				placeholder="Cari di {source?.name ?? 'source ini'}..."
				bind:value={searchInput}
				class="w-full rounded-[var(--radius)] border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus:border-accent"
			/>
		</div>
		{#if activeSearch}
			<Button variant="secondary" onclick={clearSearch} type="button">
				<X size={15} /> Hapus
			</Button>
		{:else}
			<Button type="submit" disabled={!searchInput.trim()}>Cari</Button>
		{/if}
	</form>

	<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			{#if activeSearch}
				<p class="text-sm text-muted">
					Hasil untuk "<span class="font-medium text-text">{activeSearch}</span>"
				</p>
			{:else}
				<Tabs
					active={tab}
					onchange={(v) => setTab(v as FetchMangaType)}
					items={[
						{ value: 'POPULAR', label: 'Populer' },
						{ value: 'LATEST', label: 'Terbaru' }
					]}
				/>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<Select bind:value={filterLib} class="w-44">
				<option value="all">Semua</option>
				<option value="in_library">Di Library</option>
				<option value="not_in_library">Belum di Library</option>
			</Select>

			{#if sourceFilters.length > 0}
				<button
					type="button"
					onclick={openFilter}
					class="relative inline-flex items-center gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm text-text transition hover:bg-surface-hover"
				>
					<SlidersHorizontal size={15} />
					Filter
					{#if activeFilterCount > 0}
						<span class="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
							{activeFilterCount}
						</span>
					{/if}
				</button>
			{/if}
		</div>
	</div>

	{#if error}
		<div class="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<GridSkeleton />
	{:else if displayMangas.length === 0}
		<EmptyState
			title={activeSearch ? 'Tidak ditemukan' : 'Tidak ada hasil'}
			description={activeSearch
				? `Tidak ada hasil untuk "${activeSearch}".`
				: 'Source ini belum mengembalikan komik.'}
		/>
	{:else}
		<MangaGrid>
			{#each displayMangas as manga (manga.id)}
				<MangaCard {manga} href="/manga/{manga.id}" showLibraryToggle />
			{/each}
		</MangaGrid>

		<div bind:this={sentinel} class="h-1"></div>
		{#if loadingMore}
			<div class="flex justify-center py-8 text-muted"><Spinner size={24} /></div>
		{/if}
	{/if}
</section>

<Sheet bind:open={filterOpen} title="Filter" side="right">
	<div class="flex h-full flex-col">
		<div class="flex-1 space-y-6 overflow-y-auto pb-4">
			{#each uiFilters as filter, fi}
				{#if filter.__typename === 'HeaderFilter'}
					<h3 class="text-xs font-semibold uppercase tracking-wider text-muted">{filter.name}</h3>
				{:else if filter.__typename === 'SeparatorFilter'}
					<hr class="border-border" />
				{:else if filter.__typename === 'SortFilter'}
					<div>
						<h3 class="mb-3 text-sm font-semibold text-text">{filter.name}</h3>
						<div class="space-y-1">
							{#each filter.values as option, vi}
								{@const active = filter.state?.index === vi}
								<button
									type="button"
									class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition {active ? 'bg-accent/10 text-accent font-medium' : 'text-text hover:bg-surface'}"
									onclick={() => updateSort(fi, vi)}
								>
									<span>{option}</span>
									{#if active}
										{#if filter.state?.ascending}
											<ArrowUp size={14} />
										{:else}
											<ArrowDown size={14} />
										{/if}
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{:else if filter.__typename === 'SelectFilter'}
					<div>
						<h3 class="mb-3 text-sm font-semibold text-text">{filter.name}</h3>
						<div class="flex flex-wrap gap-2">
							{#each filter.values as option, vi}
								<Chip selected={filter.state === vi} onclick={() => updateSelect(fi, vi)}>
									{option}
								</Chip>
							{/each}
						</div>
					</div>
				{:else if filter.__typename === 'CheckBoxFilter'}
					<button
						type="button"
						role="checkbox"
						aria-checked={filter.state}
						class="flex w-full cursor-pointer items-center gap-3 py-1 text-left"
						onclick={() => toggleCheckbox(fi)}
					>
						<span
							class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition {filter.state ? 'border-accent bg-accent text-white' : 'border-border'}"
						>
							{#if filter.state}<Check size={10} />{/if}
						</span>
						<span class="text-sm text-text">{filter.name}</span>
					</button>
				{:else if filter.__typename === 'TriStateFilter'}
					<button
						type="button"
						class="flex items-center gap-3 text-left text-sm"
						onclick={() => cycleTriState(fi)}
					>
						<div class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition {filter.state === 'INCLUDE' ? 'border-success bg-success/15 text-success' : filter.state === 'EXCLUDE' ? 'border-danger bg-danger/15 text-danger' : 'border-border'}">
							{#if filter.state === 'INCLUDE'}<Check size={10} />{:else if filter.state === 'EXCLUDE'}<Minus size={10} />{/if}
						</div>
						<span class="text-text">{filter.name}</span>
					</button>
				{:else if filter.__typename === 'TextFilter'}
					<div>
						<span class="mb-2 block text-sm font-semibold text-text">{filter.name}</span>
						<input
							type="text"
							bind:value={filter.state}
							class="w-full rounded-[var(--radius)] border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-accent"
						/>
					</div>
				{:else if filter.__typename === 'GroupFilter'}
					<div>
						<h3 class="mb-3 text-sm font-semibold text-text">{filter.name}</h3>
						<div class="grid grid-cols-2 gap-x-4 gap-y-2">
							{#each filter.filters as child, ci}
								{#if child.__typename === 'CheckBoxFilter'}
									<button
										type="button"
										role="checkbox"
										aria-checked={child.state}
										class="flex w-full cursor-pointer items-center gap-2 py-1 text-left"
										onclick={() => toggleGroupCheckbox(fi, ci)}
									>
										<span
											class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition {child.state ? 'border-accent bg-accent text-white' : 'border-border'}"
										>
											{#if child.state}<Check size={10} />{/if}
										</span>
										<span class="text-sm text-text">{child.name}</span>
									</button>
								{:else if child.__typename === 'TriStateFilter'}
									<button
										type="button"
										class="flex items-center gap-2 text-left text-sm"
										onclick={() => cycleGroupTriState(fi, ci)}
									>
										<div class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition {child.state === 'INCLUDE' ? 'border-success bg-success/15 text-success' : child.state === 'EXCLUDE' ? 'border-danger bg-danger/15 text-danger' : 'border-border'}">
											{#if child.state === 'INCLUDE'}<Check size={10} />{:else if child.state === 'EXCLUDE'}<Minus size={10} />{/if}
										</div>
										<span class="text-text">{child.name}</span>
									</button>
								{:else if child.__typename === 'SelectFilter'}
									<div class="col-span-2">
										<p class="mb-2 text-xs text-muted">{child.name}</p>
										<div class="flex flex-wrap gap-2">
											{#each child.values as opt, vi}
												<button
													type="button"
													class="rounded-full border px-3 py-1 text-xs font-medium transition {child.state === vi ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-accent/40'}"
													onclick={() => updateGroupSelect(fi, ci, vi)}
												>
													{opt}
												</button>
											{/each}
										</div>
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			{/each}
		</div>

		<div class="flex gap-2 border-t border-border pt-4">
			<Button variant="secondary" onclick={resetFilters} block>Reset</Button>
			<Button onclick={applyFilters} block>Terapkan</Button>
		</div>
	</div>
</Sheet>
