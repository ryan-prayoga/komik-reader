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

	let queue = $state<DownloadItem[]>([]);
	let downloaderState = $state<'STARTED' | 'STOPPED'>('STOPPED');
	let downloaded = $state<
		Array<{
			id: number;
			name: string;
			mangaId: number;
			mangaTitle: string;
			isDownloaded: boolean;
		}>
	>([]);
	let offlineIds = $state<Set<number>>(new Set());
	let cachingId = $state<number | null>(null);
	let cacheProgress = $state('');
	let loading = $state(true);
	let error = $state('');

	let pollTimer: ReturnType<typeof setInterval> | undefined;

	async function refresh() {
		try {
			const [status, chapters] = await Promise.all([
				getDownloadStatus(),
				getDownloadedChapters()
			]);
			queue = status.queue;
			downloaderState = status.state;
			downloaded = chapters.map((c) => ({
				id: c.id,
				name: c.name,
				mangaId: c.mangaId,
				mangaTitle: c.mangaTitle,
				isDownloaded: c.isDownloaded
			}));

			const offlineChecks = await Promise.all(
				downloaded.map((c) => isChapterAvailableOffline(c.id))
			);
			offlineIds = new Set(downloaded.filter((_, i) => offlineChecks[i]).map((c) => c.id));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat downloads';
		} finally {
			loading = false;
		}
	}

	async function ensureDownloaderRunning() {
		if (downloaderState === 'STOPPED') {
			await startDownloader();
		}
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
	<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold">Downloads</h1>
			<p class="mt-1 text-sm text-muted">
				Antrian download Suwayomi + simpan ke perangkat untuk baca offline.
			</p>
		</div>
		{#if queue.length > 0}
			<button
				class="rounded-lg border border-border px-4 py-2 text-sm hover:border-danger hover:text-danger"
				onclick={clearQueue}
			>
				Kosongkan antrian
			</button>
		{/if}
	</div>

	{#if error}
		<div class="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<p class="text-muted">Memuat...</p>
	{:else}
		<div class="mb-8">
			<h2 class="mb-3 text-lg font-medium">
				Antrian ({queue.length})
				<span class="ml-2 text-sm font-normal text-muted">
					Downloader: {downloaderState === 'STARTED' ? 'Aktif' : 'Berhenti'}
				</span>
			</h2>
			{#if queue.length === 0}
				<p class="text-sm text-muted">Tidak ada download dalam antrian.</p>
			{:else}
				<div class="space-y-3">
					{#each queue as item (item.chapter.id)}
						<div class="rounded-xl border border-border bg-surface p-4">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p class="font-medium">{item.manga.title}</p>
									<p class="text-sm text-muted">{item.chapter.name}</p>
									<p class="mt-1 text-xs text-muted">
										{stateLabel(item.state)} · {Math.round(item.progress * 100)}%
									</p>
								</div>
								{#if item.state === 'QUEUED'}
									<button
										class="text-sm text-muted hover:text-danger"
										onclick={() => cancelDownload(item.chapter.id)}
									>
										Batal
									</button>
								{/if}
							</div>
							<div class="mt-3 h-1.5 overflow-hidden rounded-full bg-bg">
								<div
									class="h-full bg-accent transition-all"
									style="width: {Math.max(item.progress * 100, item.state === 'QUEUED' ? 5 : 0)}%"
								></div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div>
			<h2 class="mb-3 text-lg font-medium">Tersimpan di server ({downloaded.length})</h2>
			{#if downloaded.length === 0}
				<p class="text-sm text-muted">
					Belum ada chapter terdownload. Download dari halaman detail manga.
				</p>
			{:else}
				<div class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
					{#each downloaded as chapter (chapter.id)}
						<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
							<div class="min-w-0">
								<p class="truncate text-sm font-medium">{chapter.mangaTitle}</p>
								<p class="text-xs text-muted">{chapter.name}</p>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<a
									href="/read/{chapter.id}"
									class="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent"
								>
									Baca
								</a>
								{#if offlineIds.has(chapter.id)}
									<span class="rounded-md bg-success/15 px-2 py-1 text-xs text-success">
										Offline
									</span>
									<button
										class="text-xs text-muted hover:text-danger"
										onclick={() => removeFromDevice(chapter.id)}
									>
										Hapus offline
									</button>
								{:else if cachingId === chapter.id}
									<span class="text-xs text-accent">Menyimpan {cacheProgress}</span>
								{:else}
									<button
										class="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
										onclick={() => saveToDevice(chapter)}
									>
										Simpan offline
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</section>