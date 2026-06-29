<script lang="ts">
	import { onMount } from 'svelte';
	import { createCategory, deleteCategory, getCategories } from '$lib/graphql/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Input, Card, Badge, EmptyState, Spinner } from '$lib/components/ui';
	import FolderTree from '@lucide/svelte/icons/folder-tree';
	import Trash2 from '@lucide/svelte/icons/trash-2';
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
	<PageHeader title="Kategori" subtitle="Kelompokkan manga di library." />

	<form
		class="mb-6 flex flex-wrap items-end gap-3"
		onsubmit={(e) => {
			e.preventDefault();
			create();
		}}
	>
		<Input bind:value={newName} placeholder="Nama kategori baru..." class="min-w-[200px] flex-1" />
		<Button type="submit" loading={creating} disabled={!newName.trim()}>Buat</Button>
	</form>

	{#if error}
		<div class="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="flex justify-center py-16 text-muted"><Spinner size={26} /></div>
	{:else if categories.length === 0}
		<EmptyState title="Belum ada kategori" description="Buat kategori pertama di atas.">
			{#snippet icon()}<FolderTree size={32} />{/snippet}
		</EmptyState>
	{:else}
		<Card padding="none">
			<div class="divide-y divide-border">
				{#each categories as category (category.id)}
					<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
						<div class="min-w-0">
							<p class="flex items-center gap-2 text-sm font-medium text-text">
								{category.name}
								{#if category.default}<Badge tone="neutral">default</Badge>{/if}
							</p>
							<p class="text-xs text-muted">{category.mangaCount ?? 0} manga</p>
						</div>
						<div class="flex gap-2">
							<Button href="/categories/{category.id}" variant="secondary" size="sm">Lihat</Button>
							{#if !category.default}
								<Button
									variant="ghost"
									size="sm"
									loading={deletingId === category.id}
									onclick={() => remove(category)}
								>
									<Trash2 size={14} /> Hapus
								</Button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</Card>
	{/if}
</section>
