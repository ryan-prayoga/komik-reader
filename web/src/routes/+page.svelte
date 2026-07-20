<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { getInstalledSources } from '$lib/graphql/api';
	import { preferences } from '$lib/preferences.svelte';
	import { localData } from '$lib/local/data.svelte';
	import { buildContinueReading } from '$lib/continue-reading';
	import { updates } from '$lib/updates/updates.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import type { RecentChapter, Source } from '$lib/graphql/types';
	import { apiUrl } from '$lib/graphql/client';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ContinueReading from '$lib/components/ContinueReading.svelte';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import MangaGrid from '$lib/components/MangaGrid.svelte';
	import { Button, Card, EmptyState, Spinner, ViewToggle } from '$lib/components/ui';
	import { langDisplay } from '$lib/lang';
	import Puzzle from '@lucide/svelte/icons/puzzle';
	import ServerCrash from '@lucide/svelte/icons/server-crash';
	import LibraryBig from '@lucide/svelte/icons/library-big';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';

		const filterByActive = $derived($page.data.authEnabled && !$page.data.user?.is_admin);

		let allSources = $state<Source[]>([]);
		let loading = $state(true);
		let error = $state('');

		const sources = $derived(
			filterByActive && preferences.activePkgNames.length > 0
				? allSources.filter((s) => preferences.activePkgNames.includes(s.extension.pkgName))
				: allSources
		);

	// Continue-reading from local history — deduplicated per manga, latest chapter only.
	// Kept even when that latest chapter was finished (see continue-reading.ts) so the
	// card doesn't vanish the moment a chapter is completed.
	const recent = $derived.by<RecentChapter[]>(() =>
		localData.ready ? buildContinueReading(localData.history, 6) : []
	);

	// Recent library bookmarks for the home hub (newest first).
	const libraryPreview = $derived(
		localData.ready
			? [...localData.library].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)
			: []
	);

	const updatePreview = $derived(updates.withUpdates.slice(0, 8));

	async function runCheckUpdates() {
		if (updates.checking) {
			updates.stopCheck();
			return;
		}
		if (!localData.library.length) {
			showToast('Koleksi masih kosong — bookmark dulu.', 'info');
			return;
		}
		const { found, failed } = await updates.checkAll();
		if (found > 0) showToast(`${found} manga punya chapter baru.`, 'success');
		else showToast(failed ? `Selesai · ${failed} gagal.` : 'Semua sudah up to date.', 'info');
	}

	onMount(async () => {
		void updates.init();
		try {
			// Suwayomi's per-source isNsfw flag can disagree with the parent
			// extension's (e.g. Kiryuu: extension isNsfw=false, source isNsfw=true).
			// Non-admins only ever see sources they explicitly activated, so skip
			// the server-side NSFW condition here — an already-activated source
			// must never silently vanish from its own owner's browse list.
			allSources = await getInstalledSources(filterByActive ? null : preferences.nsfwFilter);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat source';
		} finally {
			loading = false;
		}
	});
</script>

<section>
	<PageHeader title="Beranda" subtitle="Lanjutkan bacaan dan jelajahi source terinstall.">
		{#if localData.library.length > 0}
			<Button variant="secondary" size="sm" loading={updates.checking} onclick={runCheckUpdates}>
				<RefreshCw size={14} class={updates.checking ? 'animate-spin' : ''} />
				{updates.checking ? `${updates.progress.done}/${updates.progress.total}` : 'Cek update'}
			</Button>
		{/if}
		<Button href="/extensions" variant="secondary" size="sm">
			<Puzzle size={15} /> Ekstensi
		</Button>
	</PageHeader>

	{#if !localData.ready || loading}
		<div class="flex justify-center py-16 text-muted">
			<Spinner size={26} label="Memuat beranda…" />
		</div>
	{:else if error}
		<Card class="border-danger/30 bg-danger/10">
			<div class="flex items-start gap-3">
				<ServerCrash size={20} class="mt-0.5 shrink-0 text-danger" />
				<div class="min-w-0 flex-1">
					<p class="font-medium text-danger">Server komik sedang tidak tersambung</p>
					<p class="mt-1 text-sm text-muted">Coba muat ulang beberapa saat lagi.</p>
					{#if $page.data.user?.is_admin}
						<p class="mt-2 text-xs text-muted/80">{error}</p>
						<p class="mt-1 text-xs text-muted/80">
							Admin: jalankan <code class="rounded bg-surface-hover px-1.5 py-0.5">cd suwayomi && ./bootstrap.sh</code>
						</p>
					{/if}
					<div class="mt-3">
						<Button size="sm" variant="secondary" onclick={() => location.reload()}>Coba lagi</Button>
					</div>
				</div>
			</div>
		</Card>
	{:else}
		<ContinueReading chapters={recent} seeAllHref="/history" />

		{#if updatePreview.length > 0 || updates.checking}
			<section class="mb-8">
				<div class="mb-3 flex items-center justify-between gap-2">
					<h2 class="text-lg font-semibold text-text">
						Update baru
						{#if updates.updateCount > 0}
							<span class="ml-1 text-sm font-normal text-muted">({updates.updateCount})</span>
						{/if}
					</h2>
					<a href="/library" class="text-sm text-accent hover:underline">Koleksi →</a>
				</div>
				{#if updates.checking && updatePreview.length === 0}
					<p class="flex items-center gap-2 text-sm text-muted">
						<Spinner size={14} /> Mengecek {updates.progress.done}/{updates.progress.total}…
					</p>
				{:else}
					<MangaGrid>
						{#each updatePreview as u (u.mangaId)}
							<MangaCard
								manga={{
									id: u.mangaId,
									title: u.title,
									thumbnailUrl: u.thumbnailUrl,
									inLibrary: true,
									sourceId: u.sourceId ?? ''
								}}
								href="/manga/{u.mangaId}"
								hasUpdate
								progressLabel={`Baru · ${u.latestChapterName}`}
								progressPercent={100}
							/>
						{/each}
					</MangaGrid>
				{/if}
			</section>
		{/if}

		{#if libraryPreview.length > 0}
			<section class="mb-8">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-lg font-semibold text-text">Dari koleksi</h2>
					<a href="/library" class="text-sm text-accent hover:underline">Semua →</a>
				</div>
				<MangaGrid>
					{#each libraryPreview as m (m.mangaId)}
						<MangaCard
							manga={{
								id: m.mangaId,
								title: m.title,
								thumbnailUrl: m.thumbnailUrl,
								inLibrary: true,
								sourceId: m.sourceId ?? ''
							}}
							href="/manga/{m.mangaId}"
							hasUpdate={updates.hasUpdate(m.mangaId)}
						/>
					{/each}
				</MangaGrid>
			</section>
		{/if}

		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-text">Jelajahi source</h2>
			{#if sources.length > 0}
				<ViewToggle
					value={preferences.extViewMode}
					onchange={(v) => (preferences.extViewMode = v)}
				/>
			{/if}
		</div>
		{#if sources.length === 0}
			<EmptyState
				title="Belum ada source aktif"
				description={filterByActive
					? 'Aktifkan ekstensi dulu untuk menampilkan source baca komik.'
					: 'Install ekstensi dulu untuk menampilkan source baca komik.'}
			>
				{#snippet icon()}
					{#if libraryPreview.length === 0 && recent.length === 0}
						<LibraryBig size={32} />
					{:else}
						<Puzzle size={32} />
					{/if}
				{/snippet}
				{#snippet action()}
					<div class="flex flex-wrap justify-center gap-2">
						<Button href="/extensions">
							{filterByActive ? 'Pilih ekstensi' : 'Buka ekstensi'}
						</Button>
						{#if libraryPreview.length === 0}
							<Button href="/search" variant="secondary">Cari komik</Button>
						{/if}
					</div>
				{/snippet}
			</EmptyState>
		{:else if preferences.extViewMode === 'grid'}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{#each sources as source}
					<a
						href="/browse/{source.id}"
						class="panel-cut flex flex-col items-center gap-2 border-[1.5px] border-border bg-surface p-3 text-center shadow-(--shadow-card) transition hover:border-accent/40"
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
						class="panel-cut flex items-center gap-4 border-[1.5px] border-border bg-surface p-4 shadow-(--shadow-card) transition hover:border-accent/40"
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
