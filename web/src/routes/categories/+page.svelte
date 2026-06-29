<script lang="ts">
	import { onMount } from 'svelte';
	import { createCategory, deleteCategory, getCategories } from '$lib/graphql/api';
	import type { Category } from '$lib/graphql/types';

	let categories = $state<Category[]>([]);
	let newName = $state('');
	let loading = $state(true);
	let creating = $state(false);
	let deletingId = $state<number | null>(null);
	let error = $state('');

	async function load() {
		categories = await getCategories();
	}

	onMount(async () => {
		try {
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat kategori';
		} finally {
			loading = false;
		}
	});

	async function create() {
		const name = newName.trim();
		if (!name) return;
		creating = true;
		error = '';
		try {
			await createCategory(name);
			newName = '';
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal buat kategori';
		} finally {
			creating = false;
		}
	}

	async function remove(category: Category) {
		if (category.default) return;
		if (!confirm(`Hapus kategori "${category.name}"?`)) return;
		deletingId = category.id;
		error = '';
		try {
			await deleteCategory(category.id);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal hapus kategori';
		} finally {
			deletingId = null;
		}
	}
</script>

<section>
	<div class="mb-6">
		<h1 class="text-2xl font-semibold">Categories</h1>
		<p class="mt-1 text-sm text-muted">Kelompokkan manga di library seperti di Aniyomi.</p>
	</div>

	<form
		class="mb-6 flex flex-wrap gap-3"
		onsubmit={(e) => {
			e.preventDefault();
			create();
		}}
	>
		<input
			type="text"
			placeholder="Nama kategori baru..."
			bind:value={newName}
			class="min-w-[200px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
		/>
		<button
			type="submit"
			class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
			disabled={creating || !newName.trim()}
		>
			{creating ? 'Membuat...' : 'Buat'}
		</button>
	</form>

	{#if error}
		<div class="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<p class="text-muted">Memuat...</p>
	{:else if categories.length === 0}
		<p class="text-muted">Belum ada kategori.</p>
	{:else}
		<div class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
			{#each categories as category (category.id)}
				<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
					<div>
						<p class="text-sm font-medium">
							{category.name}
							{#if category.default}
								<span class="ml-2 text-xs text-muted">(default)</span>
							{/if}
						</p>
						<p class="text-xs text-muted">{category.mangaCount ?? 0} manga</p>
					</div>
					<div class="flex gap-2">
						<a
							href="/categories/{category.id}"
							class="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent"
						>
							Lihat
						</a>
						{#if !category.default}
							<button
								class="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-danger hover:text-danger disabled:opacity-50"
								disabled={deletingId === category.id}
								onclick={() => remove(category)}
							>
								{deletingId === category.id ? '...' : 'Hapus'}
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>