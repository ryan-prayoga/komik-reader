<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { getInstalledSources } from '$lib/graphql/api';
	import { preferences } from '$lib/preferences.svelte';
	import { localData } from '$lib/local/data.svelte';
	import type { RecentChapter, Source } from '$lib/graphql/types';
	import { apiUrl } from '$lib/graphql/client';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ContinueReading from '$lib/components/ContinueReading.svelte';
	import { Button, Card, EmptyState, Spinner } from '$lib/components/ui';
	import { langDisplay } from '$lib/lang';
	import Puzzle from '@lucide/svelte/icons/puzzle';
	import ServerCrash from '@lucide/svelte/icons/server-crash';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import LayoutList from '@lucide/svelte/icons/layout-list';

	// Non-admin users (including guests) use per-device active extension preferences.
	const filterByActive = $derived($page.data.authEnabled && !$page.data.user?.is_admin);

	let allSources = $state<Source[]>([]);
	let loading = $state(true);
	let error = $state('');

	const sources = $derived(
		filterByActive && preferences.activePkgNames.length > 0
			? allSources.filter((s) => preferences.activePkgNames.includes(s.extension.pkgName))
			: filterByActive
				? []
				: allSources
	);

	// Continue-reading from local history — deduplicated per manga, latest chapter only.
	const recent = $derived.by<RecentChapter[]>(() => {
		const seen = new Set<number>();
		const out: RecentChapter[] = [];
		for (const h of localData.history) {
			if (h.isRead) continue;
			if (seen.has(h.mangaId)) continue;
			seen.add(h.mangaId);
			out.push({
				id: h.chapterId,
				name: h.chapterName,
				mangaId: h.mangaId,
				lastPageRead: h.lastPage,
				totalPages: h.totalPages,
				lastReadAt: '',
				manga: { id: h.mangaId, title: h.mangaTitle, thumbnailUrl: h.thumbnailUrl }
			});
			if (out.length >= 6) break;
		}
		return out;
	});

	onMount(async () => {
		try {
			allSources = await getInstalledSources(preferences.nsfwFilter);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat source';
		} finally {
			loading = false;
		}
	});
</script>

<section>
	<PageHeader title="Beranda" subtitle="Lanjutkan bacaan dan jelajahi source terinstall.">
		<Button href="/extensions" variant="secondary" size="sm">
			<Puzzle size={15} /> Extensions
		</Button>
	</PageHeader>

	{#if loading}
		<div class="flex justify-center py-16 text-muted"><Spinner size={26} /></div>
	{:else if error}
		<Card class="border-danger/30 bg-danger/10">
			<div class="flex items-start gap-3">
				<ServerCrash size={20} class="mt-0.5 shrink-0 text-danger" />
				<div>
					<p class="font-medium text-danger">Suwayomi tidak terhubung</p>
					<p class="mt-1 text-sm text-muted">{error}</p>
					<p class="mt-2 text-sm text-muted">
						Jalankan <code class="rounded bg-surface-hover px-1.5 py-0.5">cd suwayomi && ./bootstrap.sh</code>
					</p>
				</div>
			</div>
		</Card>
	{:else}
		<ContinueReading chapters={recent} seeAllHref="/library" />

		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-text">Source Terinstall</h2>
			{#if sources.length > 0}
				<div class="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
					<button
						onclick={() => (preferences.extViewMode = 'list')}
						class="rounded-md p-1.5 transition {preferences.extViewMode === 'list' ? 'bg-accent text-white' : 'text-muted hover:text-text'}"
						title="Tampilan list"
					>
						<LayoutList size={15} />
					</button>
					<button
						onclick={() => (preferences.extViewMode = 'grid')}
						class="rounded-md p-1.5 transition {preferences.extViewMode === 'grid' ? 'bg-accent text-white' : 'text-muted hover:text-text'}"
						title="Tampilan grid"
					>
						<LayoutGrid size={15} />
					</button>
				</div>
			{/if}
		</div>
		{#if sources.length === 0}
			<EmptyState
				title="Belum ada source aktif"
				description={filterByActive
					? 'Aktifkan extension dulu untuk menampilkan source baca komik.'
					: 'Install extension dulu untuk menampilkan source baca komik.'}
			>
				{#snippet icon()}<Puzzle size={32} />{/snippet}
				{#snippet action()}<Button href="/extensions">
					{filterByActive ? 'Pilih Extension' : 'Buka Extensions'}
				</Button>{/snippet}
			</EmptyState>
		{:else if preferences.extViewMode === 'grid'}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{#each sources as source}
					<a
						href="/browse/{source.id}"
						class="flex flex-col items-center gap-2 rounded-[var(--radius)] border border-border bg-surface p-3 text-center shadow-(--shadow-card) transition hover:border-accent/40"
					>
						<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg text-muted">
							{#if source.iconUrl}
								<img src={apiUrl(source.iconUrl)} alt="" class="h-full w-full object-cover" />
							{:else}
								<Puzzle size={22} />
							{/if}
						</div>
						<div class="w-full min-w-0">
							<p class="truncate text-sm font-medium text-text">{source.name}</p>
							<p class="truncate text-xs text-muted">{langDisplay(source.lang)}</p>
						</div>
					</a>
				{/each}
			</div>
		{:else}
			<div class="space-y-3">
				{#each sources as source}
					<a
						href="/browse/{source.id}"
						class="flex items-center gap-4 rounded-[var(--radius)] border border-border bg-surface p-4 shadow-(--shadow-card) transition hover:border-accent/40"
					>
						<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg text-muted">
							{#if source.iconUrl}
								<img src={apiUrl(source.iconUrl)} alt="" class="h-full w-full object-cover" />
							{:else}
								<Puzzle size={22} />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<h3 class="font-medium text-text">{source.name}</h3>
							<p class="text-sm text-muted">{langDisplay(source.lang)}</p>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	{/if}
</section>
