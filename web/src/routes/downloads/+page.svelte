<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/stores';
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
	let offlineIds = $state<Set<number>>(new Set());
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
			const offlineChecks = await Promise.all(downloaded.map((c) => isChapterAvailableOffline(c.id)));
			offlineIds = new Set(downloaded.filter((_, i) => offlineChecks[i]).map((c) => c.id));
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
		const next = new Set(offlineIds);
		next.delete(chapterId);
		offlineIds = next;
		showToast('Chapter dihapus.', 'success');
	}

	async function doRemoveChapters(chapters: OfflineChapter[]) {
		for (const c of chapters) await removeChapterFromDevice(c.chapterId);
		const ids = new Set(chapters.map((c) => c.chapterId));
		offlineChapters = offlineChapters.filter((c) => !ids.has(c.chapterId));
		const next = new Set(offlineIds);
		ids.forEach((id) => next.delete(id));
		offlineIds = next;
	}

	function confirmRemoveAll(group: OfflineGroup) {
		openConfirm({
			title: 'Hapus semua chapter?',
			body: `${group.chapters.length} chapter dari "${group.mangaTitle}" akan dihapus dari perangkat.`,
			onconfirm: async () => {
				await doRemoveChapters(group.chapters);
				showToast(`${group.chapters.length} chapter dihapus.`, 'success');
			}
		});
	}

	function confirmRemoveRead(group: OfflineGroup) {
		const readIds = new Set(localData.history.filter((h) => h.isRead).map((h) => h.chapterId));
		const toDelete = group.chapters.filter((c) => readIds.has(c.chapterId));
		if (toDelete.length === 0) {
			showToast('Tidak ada chapter sudah dibaca.', 'info');
			return;
		}
		openConfirm({
			title: 'Hapus chapter sudah dibaca?',
			body: `${toDelete.length} dari ${group.chapters.length} chapter "${group.mangaTitle}" akan dihapus.`,
			onconfirm: async () => {
				await doRemoveChapters(toDelete);
				showToast(`${toDelete.length} chapter dihapus.`, 'success');
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

	type OfflineGroup = { mangaId: number; mangaTitle: string; thumbnailUrl?: string | null; sourceId?: string | null; chapters: OfflineChapter[] };
	const offlineGroups = $derived.by<OfflineGroup[]>(() => {
		const map = new Map<number, OfflineGroup>();
		for (const c of offlineChapters) {
			if (!map.has(c.mangaId)) map.set(c.mangaId, { mangaId: c.mangaId, mangaTitle: c.mangaTitle, thumbnailUrl: c.thumbnailUrl, sourceId: c.sourceId, chapters: [] });
			map.get(c.mangaId)!.chapters.push(c);
		}
		return [...map.values()];
	});

	type ServerGroup = { mangaId: number; mangaTitle: string; thumbnailUrl: string | null; sourceId: string; chapters: (typeof downloaded)[number][] };
	const serverGroups = $derived.by<ServerGroup[]>(() => {
		const map = new Map<number, ServerGroup>();
		for (const c of downloaded) {
			if (!map.has(c.mangaId)) map.set(c.mangaId, { mangaId: c.mangaId, mangaTitle: c.mangaTitle, thumbnailUrl: c.thumbnailUrl, sourceId: c.sourceId, chapters: [] });
			map.get(c.mangaId)!.chapters.push(c);
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

	<!-- Device cache — always visible, no login needed -->
	<div class="mb-8">
		<h2 class="mb-3 text-lg font-semibold text-text">Tersimpan di perangkat</h2>
		{#if offlineLoading}
			<div class="flex justify-center py-8 text-muted"><Spinner size={24} /></div>
		{:else if offlineChapters.length === 0}
			<EmptyState
				title="Belum ada chapter offline"
				description="Tap ikon download di chapter untuk simpan ke perangkat."
			>
				{#snippet icon()}<WifiOff size={32} />{/snippet}
			</EmptyState>
		{:else}
			<div class="space-y-2">
				{#each offlineGroups as group (group.mangaId)}
					{@const key = `device-${group.mangaId}`}
					{@const open = openGroups.has(key)}
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
											<p class="text-xs text-muted">{chapter.pageCount} hlm · {formatDate(chapter.cachedAt)}</p>
										</div>
										<div class="flex shrink-0 gap-2">
											<Button href="/read/{chapter.chapterId}" size="sm">Baca</Button>
											<Button variant="ghost" size="sm" onclick={() => removeFromDevice(chapter.chapterId)}>
												<Trash2 size={14} />
											</Button>
										</div>
									</div>
								{/each}
								<div class="flex gap-2 border-t border-border px-4 py-2.5">
									<Button variant="ghost" size="sm" onclick={() => confirmRemoveRead(group)}>
										<Trash2 size={13} /> Hapus sudah dibaca
									</Button>
									<Button variant="ghost" size="sm" onclick={() => confirmRemoveAll(group)}>
										<Trash2 size={13} /> Hapus semua
									</Button>
								</div>
							</div>
						{/if}
					</Card>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Server sections — logged-in only -->
	{#if guest}
		<div class="rounded-[var(--radius)] border border-border bg-surface-hover px-4 py-3 text-sm text-muted">
			<a href="/login" class="font-medium text-accent hover:underline">Masuk</a> untuk mengelola antrian download server.
		</div>
	{:else if serverLoading}
		<div class="flex justify-center py-16 text-muted"><Spinner size={26} /></div>
	{:else}
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

		<div>
			<h2 class="mb-3 text-lg font-semibold text-text">Tersimpan di server ({downloaded.length})</h2>
			{#if downloaded.length === 0}
				<EmptyState
					title="Belum ada chapter terdownload"
					description="Download dari halaman detail manga."
				/>
			{:else}
				<div class="space-y-2">
					{#each serverGroups as group (group.mangaId)}
						{@const key = `server-${group.mangaId}`}
						{@const open = openGroups.has(key)}
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
									{#each group.chapters as chapter (chapter.id)}
										<div class="flex items-center justify-between gap-3 px-4 py-2.5">
											<p class="min-w-0 truncate text-sm text-text">{chapter.name}</p>
											<div class="flex shrink-0 flex-wrap items-center gap-2">
												<Button href="/read/{chapter.id}" variant="secondary" size="sm">Baca</Button>
												{#if offlineIds.has(chapter.id)}
													<Badge tone="success">Offline</Badge>
													<Button variant="ghost" size="sm" onclick={() => removeFromDevice(chapter.id)}>
														<Trash2 size={14} />
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
							{/if}
						</Card>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</section>

<Modal bind:open={confirmOpen} title={confirmState?.title ?? ''}>
	<p class="text-sm text-muted">{confirmState?.body ?? ''}</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmOpen = false)}>Batal</Button>
		<Button loading={confirming} onclick={runConfirm}>Hapus</Button>
	{/snippet}
</Modal>
