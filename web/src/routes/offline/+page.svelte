<script lang="ts">
	import { onMount } from 'svelte';
	import { listOfflineChapters, type OfflineChapter } from '$lib/offline/db';
	import { removeChapterFromDevice } from '$lib/offline/cache';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Card, EmptyState, Spinner } from '$lib/components/ui';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import WifiOff from '@lucide/svelte/icons/wifi-off';

	let chapters = $state<OfflineChapter[]>([]);
	let loading = $state(true);

	onMount(async () => {
		chapters = await listOfflineChapters();
		loading = false;
	});

	async function remove(chapterId: number) {
		await removeChapterFromDevice(chapterId);
		chapters = chapters.filter((c) => c.chapterId !== chapterId);
	}

	function formatDate(ts: number) {
		return new Date(ts).toLocaleString('id-ID');
	}
</script>

<section>
	<PageHeader title="Offline" subtitle="Chapter ter-cache, bisa dibaca tanpa internet." />

	{#if loading}
		<div class="flex justify-center py-16 text-muted"><Spinner size={26} /></div>
	{:else if chapters.length === 0}
		<EmptyState
			title="Belum ada chapter offline"
			description="Download chapter di server, lalu tap Simpan offline di Downloads."
		>
			{#snippet icon()}<WifiOff size={32} />{/snippet}
			{#snippet action()}<Button href="/downloads" variant="secondary">Buka Downloads</Button>{/snippet}
		</EmptyState>
	{:else}
		<Card padding="none">
			<div class="divide-y divide-border">
				{#each chapters as chapter (chapter.chapterId)}
					<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-text">{chapter.mangaTitle}</p>
							<p class="truncate text-xs text-muted">
								{chapter.chapterName} · {chapter.pageCount} halaman · {formatDate(chapter.cachedAt)}
							</p>
						</div>
						<div class="flex shrink-0 gap-2">
							<Button href="/read/{chapter.chapterId}" size="sm">Baca</Button>
							<Button variant="ghost" size="sm" onclick={() => remove(chapter.chapterId)}>
								<Trash2 size={14} /> Hapus
							</Button>
						</div>
					</div>
				{/each}
			</div>
		</Card>
	{/if}
</section>
