<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		clearDownloader,
		dequeueChapterDownload,
		getDownloadStatus,
		getDownloadedChapters,
		startDownloader
	} from '$lib/graphql/api';
	import type { DownloadItem } from '$lib/graphql/types';
	import {
		cacheChapterToDevice,
		isChapterAvailableOffline,
		removeChapterFromDevice
	} from '$lib/offline/cache';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Card, Badge, EmptyState, Spinner } from '$lib/components/ui';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let queue = $state<DownloadItem[]>([]);
	let downloaderState = $state<'STARTED' | 'STOPPED'>('STOPPED');
	let downloaded = $state<
		Array<{ id: number; name: string; mangaId: number; mangaTitle: string; isDownloaded: boolean }>
	>([]);
	let offlineIds = $state<Set<number>>(new Set());
	let cachingId = $state<number | null>(null);
	let cacheProgress = $state('');
	let loading = $state(true);
	let error = $state('');

	let pollTimer: ReturnType<typeof setInterval> | undefined;

	async function refresh() {
		try {
			const [status, chapters] = await Promise.all([getDownloadStatus(), getDownloadedChapters()]);
			queue = status.queue;
			downloaderState = status.state;
			downloaded = chapters.map((c) => ({
				id: c.id,
				name: c.name,
				mangaId: c.mangaId,
				mangaTitle: c.mangaTitle,
				isDownloaded: c.isDownloaded
			}));

			const offlineChecks = await Promise.all(downloaded.map((c) => isChapterAvailableOffline(c.id)));
			offlineIds = new Set(downloaded.filter((_, i) => offlineChecks[i]).map((c) => c.id));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat downloads';
		} finally {
			loading = false;
		}
	}

	async function ensureDownloaderRunning() {
		if (downloaderState === 'STOPPED') await startDownloader();
	}

	async function cancelDownload(chapterId: number) {
		await dequeueChapterDownload(chapterId);
		await refresh();
	}

	async function clearQueue() {
		await clearDownloader();
		await refresh();
	}

	async function saveToDevice(chapter: (typeof downloaded)[0]) {
		cachingId = chapter.id;
		cacheProgress = '0%';
		error = '';
		try {
			await cacheChapterToDevice(
				chapter.id,
				chapter.mangaId,
				chapter.mangaTitle,
				chapter.name,
				(done, total) => {
					cacheProgress = `${Math.round((done / total) * 100)}%`;
				}
			);
			offlineIds = new Set([...offlineIds, chapter.id]);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal simpan offline';
		} finally {
			cachingId = null;
			cacheProgress = '';
		}
	}

	async function removeFromDevice(chapterId: number) {
		await removeChapterFromDevice(chapterId);
		const next = new Set(offlineIds);
		next.delete(chapterId);
		offlineIds = next;
	}

	function stateLabel(state: string) {
		const map: Record<string, string> = {
			QUEUED: 'Antrian',
			DOWNLOADING: 'Downloading',
			FINISHED: 'Selesai',
			ERROR: 'Error'
		};
		return map[state] ?? state;
	}

	onMount(async () => {
		await refresh();
		await ensureDownloaderRunning();
		pollTimer = setInterval(refresh, 3000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});
</script>

<section>
	<PageHeader title="Downloads" subtitle="Antrian server + simpan ke perangkat untuk offline.">
		{#if queue.length > 0}
			<Button variant="ghost" size="sm" onclick={clearQueue}>
				<Trash2 size={14} /> Kosongkan antrian
			</Button>
		{/if}
	</PageHeader>

	{#if error}
		<div class="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="flex justify-center py-16 text-muted"><Spinner size={26} /></div>
	{:else}
		<div class="mb-8">
			<div class="mb-3 flex items-center gap-2">
				<h2 class="text-lg font-semibold text-text">Antrian ({queue.length})</h2>
				<Badge tone={downloaderState === 'STARTED' ? 'success' : 'neutral'}>
					{downloaderState === 'STARTED' ? 'Aktif' : 'Berhenti'}
				</Badge>
			</div>
			{#if queue.length === 0}
				<p class="text-sm text-muted">Tidak ada download dalam antrian.</p>
			{:else}
				<div class="space-y-3">
					{#each queue as item (item.chapter.id)}
						<Card>
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div class="min-w-0">
									<p class="truncate font-medium text-text">{item.manga.title}</p>
									<p class="truncate text-sm text-muted">{item.chapter.name}</p>
									<p class="mt-1 text-xs text-muted">
										{stateLabel(item.state)} · {Math.round(item.progress * 100)}%
									</p>
								</div>
								{#if item.state === 'QUEUED'}
									<Button variant="ghost" size="sm" onclick={() => cancelDownload(item.chapter.id)}>
										Batal
									</Button>
								{/if}
							</div>
							<div class="mt-3 h-1.5 overflow-hidden rounded-full bg-bg">
								<div
									class="h-full bg-accent transition-all"
									style="width: {Math.max(item.progress * 100, item.state === 'QUEUED' ? 5 : 0)}%"
								></div>
							</div>
						</Card>
					{/each}
				</div>
			{/if}
		</div>

		<div>
			<h2 class="mb-3 text-lg font-semibold text-text">Tersimpan di server ({downloaded.length})</h2>
			{#if downloaded.length === 0}
				<EmptyState
					title="Belum ada chapter terdownload"
					description="Download dari halaman detail manga."
				/>
			{:else}
				<Card padding="none">
					<div class="divide-y divide-border">
						{#each downloaded as chapter (chapter.id)}
							<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-text">{chapter.mangaTitle}</p>
									<p class="truncate text-xs text-muted">{chapter.name}</p>
								</div>
								<div class="flex flex-wrap items-center gap-2">
									<Button href="/read/{chapter.id}" variant="secondary" size="sm">Baca</Button>
									{#if offlineIds.has(chapter.id)}
										<Badge tone="success">Offline</Badge>
										<Button variant="ghost" size="sm" onclick={() => removeFromDevice(chapter.id)}>
											Hapus offline
										</Button>
									{:else if cachingId === chapter.id}
										<span class="text-xs text-accent">Menyimpan {cacheProgress}</span>
									{:else}
										<Button size="sm" onclick={() => saveToDevice(chapter)}>Simpan offline</Button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</Card>
			{/if}
		</div>
	{/if}
</section>
