<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/stores';
	import {
		clearDownloader,
		deleteDownloadedChapter,
		dequeueChapterDownload,
		getDownloadStatus,
		getDownloadedChapters,
		startDownloader
	} from '$lib/graphql/api';
	import type { DownloadItem } from '$lib/graphql/types';
	import { cacheChapterToDevice, removeChapterFromDevice } from '$lib/offline/cache';
	import { listOfflineChapters, type OfflineChapter } from '$lib/offline/db';
	import { apiUrl } from '$lib/graphql/client';
	import { localData } from '$lib/local/data.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Card, Badge, EmptyState, Spinner, Modal } from '$lib/components/ui';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	const guest = $derived(!$page.data.user && $page.data.authEnabled);

	let openGroups = $state<Set<string>>(new Set());

	function toggleGroup(key: string) {
		const next = new Set(openGroups);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		openGroups = next;
	}

	type ConfirmState = { title: string; body: string; onconfirm: () => Promise<void> };
	let confirmState = $state<ConfirmState | null>(null);
	let confirmOpen = $state(false);
	let confirming = $state(false);

	function openConfirm(state: ConfirmState) {
		confirmState = state;
		confirmOpen = true;
	}

	async function runConfirm() {
		if (!confirmState) return;
		confirming = true;
		try {
			await confirmState.onconfirm();
		} finally {
			confirming = false;
			confirmOpen = false;
		}
	}

	// Device cache state (all users)
	let offlineChapters = $state<OfflineChapter[]>([]);
	let offlineLoading = $state(true);

	// Server state (logged-in only)
	let queue = $state<DownloadItem[]>([]);
	let downloaderState = $state<'STARTED' | 'STOPPED'>('STOPPED');
	let downloaded = $state<
		Array<{ id: number; name: string; mangaId: number; mangaTitle: string; isDownloaded: boolean; thumbnailUrl: string | null; sourceId: string }>
	>([]);
	let cachingId = $state<number | null>(null);
	let cacheProgress = $state('');
	let serverLoading = $state(true);
	let error = $state('');

	let pollTimer: ReturnType<typeof setInterval> | undefined;

	async function refreshDevice() {
		offlineChapters = await listOfflineChapters();
	}

	async function refreshServer() {
		try {
			const [status, chapters] = await Promise.all([getDownloadStatus(), getDownloadedChapters()]);
			queue = status.queue;
			downloaderState = status.state;
			downloaded = chapters.map((c) => ({
				id: c.id,
				name: c.name,
				mangaId: c.mangaId,
				mangaTitle: c.mangaTitle,
				isDownloaded: c.isDownloaded,
				thumbnailUrl: c.thumbnailUrl,
				sourceId: c.sourceId
			}));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat downloads';
		} finally {
			serverLoading = false;
		}
	}

	async function cancelDownload(chapterId: number) {
		await dequeueChapterDownload(chapterId);
		await refreshServer();
	}

	async function clearQueue() {
		await clearDownloader();
		await refreshServer();
	}

	async function saveToDevice(chapter: MergedChapter, group: MergedGroup) {
		cachingId = chapter.chapterId;
		cacheProgress = '0%';
		error = '';
		try {
			await cacheChapterToDevice(
				chapter.chapterId,
				group.mangaId,
				group.mangaTitle,
				chapter.chapterName,
				(done, total) => {
					cacheProgress = `${Math.round((done / total) * 100)}%`;
				},
				group.thumbnailUrl,
				group.sourceId
			);
			await refreshDevice();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal simpan offline';
		} finally {
			cachingId = null;
			cacheProgress = '';
		}
	}

	async function removeFromDevice(chapterId: number) {
		await removeChapterFromDevice(chapterId);
		offlineChapters = offlineChapters.filter((c) => c.chapterId !== chapterId);
		showToast('Chapter dihapus dari perangkat.', 'success');
	}

	async function removeFromServer(chapterId: number) {
		await deleteDownloadedChapter(chapterId);
		await refreshServer();
		showToast('Chapter dihapus dari server.', 'success');
	}

	async function doRemoveChapters(chapterIds: number[]) {
		for (const id of chapterIds) await removeChapterFromDevice(id);
		const ids = new Set(chapterIds);
		offlineChapters = offlineChapters.filter((c) => !ids.has(c.chapterId));
	}

	function confirmRemoveAll(group: MergedGroup) {
		const ids = group.chapters.filter((c) => c.onDevice).map((c) => c.chapterId);
		if (ids.length === 0) return;
		openConfirm({
			title: 'Hapus semua chapter?',
			body: `${ids.length} chapter dari "${group.mangaTitle}" akan dihapus dari perangkat.`,
			onconfirm: async () => {
				await doRemoveChapters(ids);
				showToast(`${ids.length} chapter dihapus.`, 'success');
			}
		});
	}

	function confirmRemoveRead(group: MergedGroup) {
		const readIds = new Set(localData.history.filter((h) => h.isRead).map((h) => h.chapterId));
		const ids = group.chapters.filter((c) => c.onDevice && readIds.has(c.chapterId)).map((c) => c.chapterId);
		if (ids.length === 0) {
			showToast('Tidak ada chapter sudah dibaca di perangkat.', 'info');
			return;
		}
		openConfirm({
			title: 'Hapus chapter sudah dibaca?',
			body: `${ids.length} chapter "${group.mangaTitle}" akan dihapus dari perangkat.`,
			onconfirm: async () => {
				await doRemoveChapters(ids);
				showToast(`${ids.length} chapter dihapus.`, 'success');
			}
		});
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

	function formatDate(ts: number) {
		const diff = Date.now() - ts;
		const mins = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);
		if (mins < 1) return 'Baru saja';
		if (mins < 60) return `${mins} menit lalu`;
		if (hours < 24) return `${hours} jam lalu`;
		if (days < 7) return `${days} hari lalu`;
		return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	type MergedChapter = {
		chapterId: number;
		chapterName: string;
		pageCount?: number;
		cachedAt?: number;
		onDevice: boolean;
		onServer: boolean;
	};
	type MergedGroup = {
		mangaId: number;
		mangaTitle: string;
		thumbnailUrl: string | null;
		sourceId: string | null;
		chapters: MergedChapter[];
	};
	const mergedGroups = $derived.by<MergedGroup[]>(() => {
		const map = new Map<number, MergedGroup>();

		for (const c of offlineChapters) {
			let group = map.get(c.mangaId);
			if (!group) {
				group = { mangaId: c.mangaId, mangaTitle: c.mangaTitle, thumbnailUrl: c.thumbnailUrl ?? null, sourceId: c.sourceId ?? null, chapters: [] };
				map.set(c.mangaId, group);
			}
			group.chapters.push({
				chapterId: c.chapterId,
				chapterName: c.chapterName,
				pageCount: c.pageCount,
				cachedAt: c.cachedAt,
				onDevice: true,
				onServer: false
			});
		}

		for (const c of downloaded) {
			let group = map.get(c.mangaId);
			if (!group) {
				group = { mangaId: c.mangaId, mangaTitle: c.mangaTitle, thumbnailUrl: c.thumbnailUrl, sourceId: c.sourceId, chapters: [] };
				map.set(c.mangaId, group);
			}
			if (!group.thumbnailUrl) group.thumbnailUrl = c.thumbnailUrl;
			if (!group.sourceId) group.sourceId = c.sourceId;
			const existing = group.chapters.find((ch) => ch.chapterId === c.id);
			if (existing) existing.onServer = true;
			else group.chapters.push({ chapterId: c.id, chapterName: c.name, onDevice: false, onServer: true });
		}

		for (const group of map.values()) {
			group.chapters.sort((a, b) => a.chapterName.localeCompare(b.chapterName, undefined, { numeric: true }));
		}

		return [...map.values()];
	});

	onMount(async () => {
		await refreshDevice();
		offlineLoading = false;

		if (!guest) {
			await refreshServer();
			await startDownloader().catch(() => {});
			pollTimer = setInterval(refreshServer, 3000);
		} else {
			serverLoading = false;
		}
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});
</script>

<section>
	<PageHeader title="Downloads" subtitle="Chapter tersimpan di perangkat atau server.">
		{#if !guest && queue.length > 0}
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

	<!-- Antrian server — logged-in only -->
	{#if !guest && (queue.length > 0 || downloaderState === 'STARTED')}
		<div class="mb-8">
			<div class="mb-3 flex items-center gap-2">
				<h2 class="text-lg font-semibold text-text">Antrian server ({queue.length})</h2>
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
	{/if}

	<!-- Chapter tersimpan — gabungan perangkat + server -->
	<div>
		<h2 class="mb-3 text-lg font-semibold text-text">Chapter tersimpan</h2>
		{#if offlineLoading || (!guest && serverLoading)}
			<div class="flex justify-center py-8 text-muted"><Spinner size={24} /></div>
		{:else if mergedGroups.length === 0}
			<EmptyState
				title="Belum ada chapter tersimpan"
				description="Tap ikon download di chapter untuk simpan ke perangkat atau server."
			>
				{#snippet icon()}<WifiOff size={32} />{/snippet}
			</EmptyState>
		{:else}
			<div class="space-y-2">
				{#each mergedGroups as group (group.mangaId)}
					{@const key = `dl-${group.mangaId}`}
					{@const open = openGroups.has(key)}
					{@const hasDevice = group.chapters.some((c) => c.onDevice)}
					<Card padding="none">
						<button
							class="flex w-full items-center gap-3 px-3 py-3 text-left"
							onclick={() => toggleGroup(key)}
						>
							<div class="h-14 w-10 shrink-0 overflow-hidden rounded bg-surface-hover">
								{#if group.thumbnailUrl}
									<img src={apiUrl(group.thumbnailUrl)} alt="" class="h-full w-full object-cover" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<a
									href="/manga/{group.mangaId}"
									class="block truncate font-semibold text-text hover:text-accent"
									onclick={(e) => e.stopPropagation()}
								>{group.mangaTitle}</a>
								<div class="mt-0.5 flex items-center gap-2">
									{#if group.sourceId}
										<span class="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted">{group.sourceId}</span>
									{/if}
									<span class="text-xs text-muted">{group.chapters.length} chapter</span>
								</div>
							</div>
							<ChevronDown size={16} class="shrink-0 text-muted transition-transform duration-200 {open ? 'rotate-180' : ''}" />
						</button>
						{#if open}
							<div class="divide-y divide-border border-t border-border">
								{#each group.chapters as chapter (chapter.chapterId)}
									<div class="flex items-center justify-between gap-3 px-4 py-2.5">
										<div class="min-w-0">
											<p class="truncate text-sm text-text">{chapter.chapterName}</p>
											<div class="mt-0.5 flex items-center gap-1.5">
												{#if chapter.onDevice}
													<Badge tone="success">Perangkat</Badge>
												{/if}
												{#if chapter.onServer}
													<Badge tone="neutral">Server</Badge>
												{/if}
												{#if chapter.onDevice}
													<span class="text-xs text-muted">{chapter.pageCount} hlm · {formatDate(chapter.cachedAt ?? 0)}</span>
												{/if}
											</div>
										</div>
										<div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
											<Button href="/read/{chapter.chapterId}" size="sm">Baca</Button>
											{#if chapter.onDevice}
												<Button variant="ghost" size="sm" onclick={() => removeFromDevice(chapter.chapterId)}>
													<Trash2 size={14} />
												</Button>
											{:else if cachingId === chapter.chapterId}
												<span class="text-xs text-accent">Menyimpan {cacheProgress}</span>
											{:else}
												<Button variant="secondary" size="sm" onclick={() => saveToDevice(chapter, group)}>
													Simpan offline
												</Button>
											{/if}
											{#if chapter.onServer && !guest}
												<Button variant="ghost" size="sm" onclick={() => removeFromServer(chapter.chapterId)}>
													<Trash2 size={14} class="text-danger" />
												</Button>
											{/if}
										</div>
									</div>
								{/each}
								{#if hasDevice}
									<div class="flex gap-2 border-t border-border px-4 py-2.5">
										<Button variant="ghost" size="sm" onclick={() => confirmRemoveRead(group)}>
											<Trash2 size={13} /> Hapus sudah dibaca
										</Button>
										<Button variant="ghost" size="sm" onclick={() => confirmRemoveAll(group)}>
											<Trash2 size={13} /> Hapus semua dari perangkat
										</Button>
									</div>
								{/if}
							</div>
						{/if}
					</Card>
				{/each}
			</div>
		{/if}
	</div>
</section>

<Modal bind:open={confirmOpen} title={confirmState?.title ?? ''}>
	<p class="text-sm text-muted">{confirmState?.body ?? ''}</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmOpen = false)}>Batal</Button>
		<Button loading={confirming} onclick={runConfirm}>Hapus</Button>
	{/snippet}
</Modal>
