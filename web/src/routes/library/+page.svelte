<script lang="ts">
	import { page } from '$app/stores';
	import { localData } from '$lib/local/data.svelte';
	import { syncEngine } from '$lib/local/sync.svelte';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import MangaGrid from '$lib/components/MangaGrid.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ContinueReading from '$lib/components/ContinueReading.svelte';
	import { Button, Badge, EmptyState } from '$lib/components/ui';
	import Cloud from '@lucide/svelte/icons/cloud';
	import type { RecentChapter } from '$lib/graphql/types';

	const categoryId = $derived(
		$page.url.searchParams.get('category') ? Number($page.url.searchParams.get('category')) : null
	);

	const items = $derived(
		categoryId
			? localData.library.filter((l) => l.categoryIds.includes(categoryId))
			: localData.library
	);

	// Recent reads as a Continue-Reading rail (mapped from local history).
	const recent = $derived(
		localData.history.slice(0, 8).map(
			(h): RecentChapter => ({
				id: h.chapterId,
				name: h.chapterName,
				mangaId: h.mangaId,
				lastPageRead: h.lastPage,
				lastReadAt: '',
				manga: { id: h.mangaId, title: h.mangaTitle, thumbnailUrl: h.thumbnailUrl }
			})
		)
	);

	function lastRead(mangaId: number) {
		return localData.history.find((h) => h.mangaId === mangaId) ?? null;
	}
</script>

<section>
	<PageHeader title="Library" subtitle="Bookmark di perangkat ini. Login untuk sync antar device.">
		{#if syncEngine.loggedIn}
			<Badge tone="success"><Cloud size={13} /> Tersync</Badge>
		{:else}
			<Button href="/login" variant="secondary" size="sm">Login untuk sync</Button>
		{/if}
	</PageHeader>

	<ContinueReading chapters={recent} />

	{#if localData.categories.length > 0}
		<div class="mb-4 flex flex-wrap gap-2">
			<a
				href="/library"
				class="rounded-full border px-3 py-1 text-xs font-medium transition {!categoryId
					? 'border-accent bg-accent/15 text-accent'
					: 'border-border text-muted hover:border-accent'}"
			>
				Semua
			</a>
			{#each localData.categories as category (category.id)}
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

	{#if items.length === 0}
		<EmptyState
			title="Library masih kosong"
			description="Browse komik lalu tap + Library di halaman detail."
		>
			{#snippet action()}<Button href="/search">Cari komik</Button>{/snippet}
		</EmptyState>
	{:else}
		<MangaGrid>
			{#each items as manga (manga.mangaId)}
				{@const last = lastRead(manga.mangaId)}
				<div>
					<MangaCard
						manga={{
							id: manga.mangaId,
							title: manga.title,
							thumbnailUrl: manga.thumbnailUrl,
							inLibrary: true,
							sourceId: manga.sourceId ?? ''
						}}
						href="/manga/{manga.mangaId}"
					/>
					<a
						href={last ? `/read/${last.chapterId}` : `/manga/${manga.mangaId}`}
						class="mt-2 block truncate rounded-lg border border-border bg-surface px-3 py-1.5 text-center text-xs text-muted transition hover:border-accent hover:text-text"
					>
						{last ? `Lanjut: ${last.chapterName}` : 'Mulai baca'}
					</a>
				</div>
			{/each}
		</MangaGrid>
	{/if}
</section>
