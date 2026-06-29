<script lang="ts">
	import { onMount } from 'svelte';
	import { apiUrl } from '$lib/graphql/client';
	import { getReadingHistory, markChapterRead } from '$lib/graphql/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Card, Badge, EmptyState, Spinner } from '$lib/components/ui';
	import type { HistoryChapter } from '$lib/graphql/types';

	let chapters = $state<HistoryChapter[]>([]);
	let loading = $state(true);
	let error = $state('');
	let updatingId = $state<number | null>(null);

	onMount(async () => {
		try {
			chapters = await getReadingHistory(100);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat history';
		} finally {
			loading = false;
		}
	});

	function formatDate(ts: string) {
		const n = Number(ts);
		if (!n) return '';
		return new Date(n * 1000).toLocaleString('id-ID');
	}

	async function toggleRead(chapter: HistoryChapter) {
		updatingId = chapter.id;
		try {
			await markChapterRead(chapter.id, !chapter.isRead);
			chapters = chapters.map((c) => (c.id === chapter.id ? { ...c, isRead: !c.isRead } : c));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal update status';
		} finally {
			updatingId = null;
		}
	}
</script>

<section>
	<PageHeader title="Riwayat" subtitle="Chapter terakhir yang kamu buka." />

	{#if error}
		<div class="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="flex justify-center py-16 text-muted"><Spinner size={26} /></div>
	{:else if chapters.length === 0}
		<EmptyState
			title="Belum ada riwayat"
			description="Buka chapter di reader untuk mencatat history."
		/>
	{:else}
		<Card padding="none">
			<div class="divide-y divide-border">
				{#each chapters as chapter (chapter.id)}
					<div class="flex flex-wrap items-center gap-4 px-4 py-3">
						<a href="/manga/{chapter.manga.id}" class="h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-bg">
							{#if chapter.manga.thumbnailUrl}
								<img src={apiUrl(chapter.manga.thumbnailUrl)} alt="" class="h-full w-full object-cover" loading="lazy" />
							{/if}
						</a>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-text">{chapter.manga.title}</p>
							<p class="truncate text-xs text-muted">
								{chapter.name}
								{#if chapter.lastPageRead > 0} · hal. {chapter.lastPageRead + 1}{/if}
								{#if formatDate(chapter.lastReadAt)} · {formatDate(chapter.lastReadAt)}{/if}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							{#if chapter.isRead}
								<Badge tone="success">Selesai</Badge>
							{:else}
								<Badge tone="accent">Progress</Badge>
							{/if}
							<Button href="/read/{chapter.id}" size="sm">Baca</Button>
							<Button
								variant="secondary"
								size="sm"
								loading={updatingId === chapter.id}
								onclick={() => toggleRead(chapter)}
							>
								{chapter.isRead ? 'Unread' : 'Done'}
							</Button>
						</div>
					</div>
				{/each}
			</div>
		</Card>
	{/if}
</section>
