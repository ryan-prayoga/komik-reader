<script lang="ts">
	import { localData } from '$lib/local/data.svelte';

	interface Props {
		mangaId: number;
	}
	let { mangaId }: Props = $props();

	const all = $derived(localData.categories);
	const selected = $derived(
		new Set(localData.library.find((l) => l.mangaId === mangaId)?.categoryIds ?? [])
	);

	function toggle(categoryId: number) {
		const next = new Set(selected);
		if (next.has(categoryId)) next.delete(categoryId);
		else next.add(categoryId);
		localData.setMangaCategories(mangaId, [...next]);
	}
</script>

<div>
	<h3 class="mb-2 text-sm font-medium text-muted">Kategori</h3>
	{#if all.length === 0}
		<p class="text-xs text-muted">
			Belum ada kategori. <a href="/categories" class="text-accent hover:underline">Buat di sini</a>
		</p>
	{:else}
		<div class="flex flex-wrap gap-2">
			{#each all as category (category.id)}
				<button
					class="rounded-full border px-3 py-1 text-xs transition active:scale-95 {selected.has(
						category.id
					)
						? 'border-accent bg-accent/15 text-accent'
						: 'border-border text-muted hover:border-accent'}"
					onclick={() => toggle(category.id)}
				>
					{category.name}
				</button>
			{/each}
		</div>
	{/if}
</div>
