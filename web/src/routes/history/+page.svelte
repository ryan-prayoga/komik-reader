<script lang="ts">
	import { localData } from '$lib/local/data.svelte';
	import { syncEngine } from '$lib/local/sync.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Card, Badge, EmptyState } from '$lib/components/ui';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Cloud from '@lucide/svelte/icons/cloud';

	const chapters = $derived(localData.history);

	function formatDate(ts: number) {
		if (!ts) return '';
		return new Date(ts).toLocaleString('id-ID');
	}
</script>

<section>
	<PageHeader title="Riwayat" subtitle="Tersimpan di perangkat ini. Login untuk sync antar device.">
		{#if syncEngine.loggedIn}
			<Badge tone="success"><Cloud size={13} /> Tersync</Badge>
		{:else}
			<Button href="/login" variant="secondary" size="sm">Login untuk sync</Button>
		{/if}
	</PageHeader>

	{#if chapters.length === 0}
		<EmptyState
			title="Belum ada riwayat"
			description="Buka chapter di reader untuk mencatat riwayat baca otomatis."
		/>
	{:else}
		<Card padding="none">
			<div class="divide-y divide-border">
				{#each chapters as chapter (chapter.chapterId)}
					<div class="flex flex-wrap items-center gap-4 px-4 py-3">
						<a href="/manga/{chapter.mangaId}" class="h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-bg">
							{#if chapter.thumbnailUrl}
								<img src={chapter.thumbnailUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
							{/if}
						</a>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-text">{chapter.mangaTitle}</p>
							<p class="truncate text-xs text-muted">
								{chapter.chapterName}
								{#if chapter.lastPage > 0} · hal. {chapter.lastPage + 1}{/if}
								{#if formatDate(chapter.updatedAt)} · {formatDate(chapter.updatedAt)}{/if}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							{#if chapter.isRead}
								<Badge tone="success">Selesai</Badge>
							{:else}
								<Badge tone="accent">Progress</Badge>
							{/if}
							<Button href="/read/{chapter.chapterId}" size="sm">Baca</Button>
							<Button
								variant="secondary"
								size="sm"
								onclick={() => localData.setHistoryRead(chapter.chapterId, !chapter.isRead)}
							>
								{chapter.isRead ? 'Unread' : 'Done'}
							</Button>
							<Button variant="ghost" size="sm" onclick={() => localData.removeHistory(chapter.chapterId)}>
								<Trash2 size={14} />
							</Button>
						</div>
					</div>
				{/each}
			</div>
		</Card>
	{/if}
</section>
