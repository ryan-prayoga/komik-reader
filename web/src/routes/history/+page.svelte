<script lang="ts">
	import { onMount } from 'svelte';
	import { apiUrl } from '$lib/graphql/client';
	import { getReadingHistory, markChapterRead } from '$lib/graphql/api';
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
			chapters = chapters.map((c) =>
				c.id === chapter.id ? { ...c, isRead: !c.isRead } : c
			);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal update status';
		} finally {
			updatingId = null;
		}
	}
</script>

<section>
	<div class="mb-6">
		<h1 class="text-2xl font-semibold">History</h1>
		<p class="mt-1 text-sm text-muted">Riwayat baca berdasarkan chapter terakhir dibuka.</p>
	</div>

	{#if error}
		<div class="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<p class="text-muted">Memuat...</p>
	{:else if chapters.length === 0}
		<div class="rounded-xl border border-border bg-surface p-8 text-center">
			<p class="text-muted">Belum ada riwayat baca.</p>
			<p class="mt-2 text-sm text-muted">Buka chapter di reader untuk mencatat history.</p>
		</div>
	{:else}
		<div class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
			{#each chapters as chapter (chapter.id)}
				<div class="flex flex-wrap items-center gap-4 px-4 py-3">
					<a href="/manga/{chapter.manga.id}" class="h-14 w-10 shrink-0 overflow-hidden rounded bg-bg">
						{#if chapter.manga.thumbnailUrl}
							<img
								src={apiUrl(chapter.manga.thumbnailUrl)}
								alt=""
								class="h-full w-full object-cover"
								loading="lazy"
							/>
						{/if}
					</a>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{chapter.manga.title}</p>
						<p class="text-xs text-muted">
							{chapter.name}
							{#if chapter.lastPageRead > 0}
								· hal. {chapter.lastPageRead + 1}
							{/if}
							{#if formatDate(chapter.lastReadAt)}
								· {formatDate(chapter.lastReadAt)}
							{/if}
						</p>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						{#if chapter.isRead}
							<span class="text-xs text-success">Selesai</span>
						{:else}
							<span class="text-xs text-accent">Progress</span>
						{/if}
						<a
							href="/read/{chapter.id}"
							class="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
						>
							Baca
						</a>
						<button
							class="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-accent disabled:opacity-50"
							disabled={updatingId === chapter.id}
							onclick={() => toggleRead(chapter)}
						>
							{chapter.isRead ? 'Unread' : 'Done'}
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>