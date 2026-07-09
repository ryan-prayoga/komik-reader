<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { localData } from '$lib/local/data.svelte';
	import { syncEngine } from '$lib/local/sync.svelte';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import MangaGrid from '$lib/components/MangaGrid.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Badge, Chip, EmptyState, Spinner, Input, Modal, Select } from '$lib/components/ui';
	import Cloud from '@lucide/svelte/icons/cloud';
	import FolderTree from '@lucide/svelte/icons/folder-tree';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Search from '@lucide/svelte/icons/search';

	onMount(() => {
		localData.reload();
	});

	const categoryId = $derived(
		$page.url.searchParams.get('category') ? Number($page.url.searchParams.get('category')) : null
	);

	let search = $state('');
	let sortBy = $state<'recent' | 'title' | 'title_desc'>('recent');

	// mangaId → most-recent read timestamp, for the "terakhir dibaca" sort.
	const lastReadAt = $derived.by(() => {
		const map = new Map<number, number>();
		for (const h of localData.history) {
			const prev = map.get(h.mangaId) ?? 0;
			if (h.updatedAt > prev) map.set(h.mangaId, h.updatedAt);
		}
		return map;
	});

	const items = $derived.by(() => {
		const lib = localData.library;
		const inCat = categoryId ? lib.filter((l) => l.categoryIds.includes(categoryId)) : lib;
		const q = search.trim().toLowerCase();
		const filtered = q ? inCat.filter((l) => l.title.toLowerCase().includes(q)) : inCat;
		const sorted = [...filtered];
		if (sortBy === 'title') {
			sorted.sort((a, b) => a.title.localeCompare(b.title));
		} else if (sortBy === 'title_desc') {
			sorted.sort((a, b) => b.title.localeCompare(a.title));
		} else {
			sorted.sort(
				(a, b) => (lastReadAt.get(b.mangaId) ?? 0) - (lastReadAt.get(a.mangaId) ?? 0)
			);
		}
		return sorted;
	});

	function lastRead(mangaId: number) {
		return localData.history.find((h) => h.mangaId === mangaId) ?? null;
	}

	let manageOpen = $state(false);
	let newCategoryName = $state('');

	let confirmCatOpen = $state(false);
	let pendingCat = $state<{ id: number; name: string } | null>(null);

	async function createCategory() {
		const name = newCategoryName.trim();
		if (!name) return;
		await localData.createCategory(name);
		newCategoryName = '';
	}

	function askRemoveCategory(id: number, name: string) {
		pendingCat = { id, name };
		confirmCatOpen = true;
	}
	async function confirmRemoveCategory() {
		if (pendingCat) await localData.deleteCategory(pendingCat.id);
		confirmCatOpen = false;
		pendingCat = null;
	}
</script>

<section>
	<PageHeader title="Koleksi" subtitle="Bookmark di perangkat ini. Login untuk sync antar device.">
		{#if syncEngine.loggedIn}
			<Badge tone="success"><Cloud size={13} /> Tersync</Badge>
		{:else}
			<Button href="/login" variant="secondary" size="sm">Login untuk sync</Button>
		{/if}
	</PageHeader>

	<div class="mb-4 flex flex-wrap items-center gap-2">
		{#if localData.categories.length > 0}
			<Chip href="/library" selected={!categoryId}>Semua</Chip>
			{#each localData.categories as category (category.id)}
				<Chip href="/library?category={category.id}" selected={categoryId === category.id}>
					{category.name}
				</Chip>
			{/each}
		{/if}
		<Chip dashed onclick={() => (manageOpen = true)}>
			<FolderTree size={13} /> Kelola Kategori
		</Chip>
	</div>

	{#if localData.library.length > 0}
		<div class="mb-5 flex flex-wrap items-center gap-2">
			<div class="relative min-w-[200px] flex-1">
				<Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
				<input
					type="search"
					placeholder="Cari di library..."
					bind:value={search}
					class="w-full rounded-[var(--radius)] border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus:border-accent"
				/>
			</div>
			<Select bind:value={sortBy} class="w-44">
				<option value="recent">Terakhir dibaca</option>
				<option value="title">Judul A–Z</option>
				<option value="title_desc">Judul Z–A</option>
			</Select>
		</div>
	{/if}

	{#if !localData.ready}
		<div class="flex justify-center py-20 text-muted"><Spinner size={28} /></div>
	{:else if items.length === 0 && (search.trim() || categoryId)}
		<EmptyState title="Tidak ditemukan" description="Coba ubah pencarian atau kategori." />
	{:else if items.length === 0}
		<EmptyState
			title="Koleksi masih kosong"
			description="Jelajahi komik lalu tap Koleksi di halaman detail."
		>
			{#snippet action()}<Button href="/search">Cari komik</Button>{/snippet}
		</EmptyState>
	{:else}
		<MangaGrid>
			{#each items as manga (manga.mangaId)}
				{@const last = lastRead(manga.mangaId)}
				{@const pct =
					last && !last.isRead && last.totalPages
						? Math.min(100, Math.round(((last.lastPage + 1) / last.totalPages) * 100))
						: null}
				<MangaCard
					manga={{
						id: manga.mangaId,
						title: manga.title,
						thumbnailUrl: manga.thumbnailUrl,
						inLibrary: true,
						sourceId: manga.sourceId ?? ''
					}}
					href={last && !last.isRead ? `/read/${last.chapterId}` : `/manga/${manga.mangaId}`}
					progressLabel={last && !last.isRead ? `Lanjut · ${last.chapterName}` : null}
					progressPercent={pct}
				/>
			{/each}
		</MangaGrid>
	{/if}
</section>

<Modal bind:open={manageOpen} title="Kelola Kategori">
	<form
		class="mb-4 flex flex-wrap items-end gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			createCategory();
		}}
	>
		<Input bind:value={newCategoryName} placeholder="Nama kategori baru..." class="min-w-[160px] flex-1" />
		<Button type="submit" size="sm" disabled={!newCategoryName.trim()}>Buat</Button>
	</form>
	{#if localData.categories.length === 0}
		<p class="text-xs text-muted">Belum ada kategori.</p>
	{:else}
		<div class="divide-y divide-border">
			{#each localData.categories as category (category.id)}
				<div class="flex items-center justify-between gap-3 py-2">
					<div class="min-w-0">
						<p class="text-sm font-medium text-text">{category.name}</p>
						<p class="text-xs text-muted">{localData.mangaInCategory(category.id).length} manga</p>
					</div>
					<Button variant="ghost" size="sm" onclick={() => askRemoveCategory(category.id, category.name)}>
						<Trash2 size={14} /> Hapus
					</Button>
				</div>
			{/each}
		</div>
	{/if}
</Modal>

<Modal bind:open={confirmCatOpen} title="Hapus kategori?">
	<p class="text-sm text-muted">
		Kategori "{pendingCat?.name ?? ''}" akan dihapus. Komik di dalamnya tetap ada di library.
	</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmCatOpen = false)}>Batal</Button>
		<Button onclick={confirmRemoveCategory}>Hapus</Button>
	{/snippet}
</Modal>
