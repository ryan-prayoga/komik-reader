<script lang="ts">
	import { localData } from '$lib/local/data.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Input, Card, EmptyState } from '$lib/components/ui';
	import FolderTree from '@lucide/svelte/icons/folder-tree';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let newName = $state('');

	const categories = $derived(localData.categories);

	async function create() {
		const name = newName.trim();
		if (!name) return;
		await localData.createCategory(name);
		newName = '';
	}

	async function remove(id: number, name: string) {
		if (!confirm(`Hapus kategori "${name}"?`)) return;
		await localData.deleteCategory(id);
	}
</script>

<section>
	<PageHeader title="Kategori" subtitle="Kelompokkan library. Tersimpan di perangkat, sync saat login." />

	<form
		class="mb-6 flex flex-wrap items-end gap-3"
		onsubmit={(e) => {
			e.preventDefault();
			create();
		}}
	>
		<Input bind:value={newName} placeholder="Nama kategori baru..." class="min-w-[200px] flex-1" />
		<Button type="submit" disabled={!newName.trim()}>Buat</Button>
	</form>

	{#if categories.length === 0}
		<EmptyState title="Belum ada kategori" description="Buat kategori pertama di atas.">
			{#snippet icon()}<FolderTree size={32} />{/snippet}
		</EmptyState>
	{:else}
		<Card padding="none">
			<div class="divide-y divide-border">
				{#each categories as category (category.id)}
					<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
						<div class="min-w-0">
							<p class="text-sm font-medium text-text">{category.name}</p>
							<p class="text-xs text-muted">{localData.mangaInCategory(category.id).length} manga</p>
						</div>
						<div class="flex gap-2">
							<Button href="/categories/{category.id}" variant="secondary" size="sm">Lihat</Button>
							<Button variant="ghost" size="sm" onclick={() => remove(category.id, category.name)}>
								<Trash2 size={14} /> Hapus
							</Button>
						</div>
					</div>
				{/each}
			</div>
		</Card>
	{/if}
</section>
