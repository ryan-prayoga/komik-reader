<script lang="ts">
	import { onMount } from 'svelte';
	import { getCategories, getMangaCategories, updateMangaCategories } from '$lib/graphql/api';
	import type { Category } from '$lib/graphql/types';

	interface Props {
		mangaId: number;
	}

	let { mangaId }: Props = $props();

	let all = $state<Category[]>([]);
	let selected = $state<Set<number>>(new Set());
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');

	onMount(async () => {
		try {
			const [categories, mangaCategories] = await Promise.all([
				getCategories(),
				getMangaCategories(mangaId)
			]);
			all = categories;
			selected = new Set(mangaCategories.map((c) => c.id));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat kategori';
		} finally {
			loading = false;
		}
	});

	async function toggle(categoryId: number) {
		if (saving) return;
		const wasSelected = selected.has(categoryId);
		const previous = new Set(selected);
		const next = new Set(selected);
		if (wasSelected) next.delete(categoryId);
		else next.add(categoryId);
		selected = next;
		saving = true;
		error = '';
		try {
			const updated = await updateMangaCategories(
				mangaId,
				wasSelected ? [] : [categoryId],
				wasSelected ? [categoryId] : []
			);
			selected = new Set(updated.map((c) => c.id));
		} catch (e) {
			selected = previous;
			error = e instanceof Error ? e.message : 'Gagal update kategori';
		} finally {
			saving = false;
		}
	}
</script>

<div>
	<h3 class="mb-2 text-sm font-medium text-muted">Kategori</h3>
	{#if loading}
		<p class="text-xs text-muted">Memuat kategori...</p>
	{:else if all.length === 0}
		<p class="text-xs text-muted">
			Belum ada kategori. <a href="/categories" class="text-accent hover:underline">Buat di sini</a>
		</p>
	{:else}
		<div class="flex flex-wrap gap-2">
			{#each all as category (category.id)}
				<button
					class="rounded-full border px-3 py-1 text-xs transition disabled:opacity-50 {selected.has(
						category.id
					)
						? 'border-accent bg-accent/15 text-accent'
						: 'border-border text-muted hover:border-accent'}"
					disabled={saving}
					onclick={() => toggle(category.id)}
				>
					{category.name}
				</button>
			{/each}
		</div>
	{/if}
	{#if error}
		<p class="mt-2 text-xs text-danger">{error}</p>
	{/if}
</div>