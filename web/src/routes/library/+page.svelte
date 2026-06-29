<script lang="ts">
	import { page } from '$app/stores';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import MangaGrid from '$lib/components/MangaGrid.svelte';
	import GridSkeleton from '$lib/components/GridSkeleton.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ContinueReading from '$lib/components/ContinueReading.svelte';
	import { Tabs, EmptyState } from '$lib/components/ui';
	import { getCategories, getLibraryManga, getRecentlyReadChapters } from '$lib/graphql/api';
	import { continueReadingLabel, continueReadingUrl } from '$lib/library';
	import type { Category, LibraryManga, RecentChapter } from '$lib/graphql/types';

	type Tab = 'all' | 'unread';

	let tab = $state<Tab>('all');
	let mangas = $state<LibraryManga[]>([]);
	let recent = $state<RecentChapter[]>([]);
	let categories = $state<Category[]>([]);
	let loading = $state(true);
	let error = $state('');

	const categoryId = $derived(
		$page.url.searchParams.get('category')
			? Number($page.url.searchParams.get('category'))
			: undefined
	);

	const unreadCount = $derived(mangas.filter((m) => m.unreadCount > 0).length);
	const filtered = $derived(tab === 'unread' ? mangas.filter((m) => m.unreadCount > 0) : mangas);

	$effect(() => {
		const id = categoryId;
		let cancelled = false;
		loading = true;
		error = '';

		Promise.all([getLibraryManga(id), getRecentlyReadChapters(8), getCategories()])
			.then(([library, chapters, cats]) => {
				if (cancelled) return;
				mangas = library;
				recent = chapters;
				categories = cats;
			})
			.catch((e) => {
				if (cancelled) return;
				error = e instanceof Error ? e.message : 'Gagal memuat library';
			})
			.finally(() => {
				if (!cancelled) loading = false;
			});

		return () => {
			cancelled = true;
		};
	});
</script>

<section>
	<PageHeader title="Library" subtitle="Koleksi manga favoritmu." />

	{#if error}
		<div class="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<GridSkeleton />
	{:else}
		<ContinueReading chapters={recent} />

		{#if categories.length > 0}
			<div class="mb-4 flex flex-wrap gap-2">
				<a
					href="/library"
					class="rounded-full border px-3 py-1 text-xs font-medium transition {!categoryId
						? 'border-accent bg-accent/15 text-accent'
						: 'border-border text-muted hover:border-accent'}"
				>
					Semua kategori
				</a>
				{#each categories as category (category.id)}
					<a
						href="/library?category={category.id}"
						class="rounded-full border px-3 py-1 text-xs font-medium transition {categoryId ===
						category.id
							? 'border-accent bg-accent/15 text-accent'
							: 'border-border text-muted hover:border-accent'}"
					>
						{category.name}
					</a>
				{/each}
			</div>
		{/if}

		<Tabs
			class="mb-5"
			active={tab}
			onchange={(v) => (tab = v as Tab)}
			items={[
				{ value: 'all', label: 'Semua', badge: mangas.length },
				{ value: 'unread', label: 'Belum dibaca', badge: unreadCount }
			]}
		/>

		{#if filtered.length === 0}
			<EmptyState
				title={tab === 'unread' ? 'Semua chapter sudah dibaca' : 'Library masih kosong'}
				description={tab === 'all'
					? 'Browse komik lalu tap + Library di halaman detail.'
					: undefined}
			/>
		{:else}
			<MangaGrid>
				{#each filtered as manga (manga.id)}
					<div>
						<MangaCard {manga} href="/manga/{manga.id}" badge={manga.unreadCount} />
						<a
							href={continueReadingUrl(manga)}
							class="mt-2 block truncate rounded-lg border border-border bg-surface px-3 py-1.5 text-center text-xs text-muted transition hover:border-accent hover:text-text"
						>
							Lanjut: {continueReadingLabel(manga)}
						</a>
					</div>
				{/each}
			</MangaGrid>
		{/if}
	{/if}
</section>
