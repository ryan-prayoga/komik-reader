<script lang="ts">
	import { page } from '$app/stores';
	import { localData } from '$lib/local/data.svelte';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import MangaGrid from '$lib/components/MangaGrid.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { EmptyState } from '$lib/components/ui';

	const categoryId = $derived(Number($page.params.id));
	const category = $derived(localData.categories.find((c) => c.id === categoryId));
	const items = $derived(localData.mangaInCategory(categoryId));
</script>

<section>
	<a href="/categories" class="mb-2 inline-block text-sm text-muted transition hover:text-accent">
		← Kategori
	</a>
	<PageHeader title={category?.name ?? 'Kategori'} subtitle={`${items.length} manga`} />

	{#if items.length === 0}
		<EmptyState title="Kategori kosong" description="Tambahkan manga ke kategori ini dari halaman detail." />
	{:else}
		<MangaGrid>
			{#each items as item (item.mangaId)}
				<MangaCard
					manga={{
						id: item.mangaId,
						title: item.title,
						thumbnailUrl: item.thumbnailUrl,
						inLibrary: true,
						sourceId: item.sourceId ?? ''
					}}
					href="/manga/{item.mangaId}"
				/>
			{/each}
		</MangaGrid>
	{/if}
</section>
