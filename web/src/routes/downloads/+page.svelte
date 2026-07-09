<script lang="ts">
	import { onMount } from 'svelte';
	import { getInstalledSources } from '$lib/graphql/api';
	import { removeChapterFromDevice } from '$lib/offline/cache';
	import { listOfflineChapters, type OfflineChapter } from '$lib/offline/db';
	import { apiUrl } from '$lib/graphql/client';
	import { localData } from '$lib/local/data.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { relativeTime as formatDate } from '$lib/utils/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Card, EmptyState, Spinner, Modal } from '$lib/components/ui';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import CheckSquare from '@lucide/svelte/icons/check-square';
	import Square from '@lucide/svelte/icons/square';

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

	let offlineChapters = $state<OfflineChapter[]>([]);
	let loading = $state(true);
	let storageLabel = $state('');

	const totalChapters = $derived(offlineChapters.length);
	const totalPages = $derived(offlineChapters.reduce((n, c) => n + c.pageCount, 0));

	function formatBytes(bytes: number): string {
		if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}

	async function refreshStorage() {
		try {
			if (navigator.storage?.estimate) {
				const est = await navigator.storage.estimate();
				if (est.usage) storageLabel = formatBytes(est.usage);
			}
		} catch {
			/* estimate unsupported */
		}
	}

	// sourceId → human-readable source name (best-effort; needs Suwayomi online).
	let sourceNames = $state<Record<string, string>>({});

	async function refresh() {
		offlineChapters = await listOfflineChapters();
	}

	let selected = $state<Set<number>>(new Set());
	let selectMode = $state(false);
	/** Deferred hard-deletes so toast "Urungkan" can cancel within the window. */
	const pendingHardDelete = new Map<number, ReturnType<typeof setTimeout>>();

	const selectedCount = $derived(selected.size);

	function toggleSelect(id: number) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	function toggleSelectAllInGroup(chapters: OfflineChapter[]) {
		const next = new Set(selected);
		const allOn = chapters.every((c) => next.has(c.chapterId));
		for (const c of chapters) {
			if (allOn) next.delete(c.chapterId);
			else next.add(c.chapterId);
		}
		selected = next;
	}

	function exitSelectMode() {
		selectMode = false;
		selected = new Set();
	}

	function scheduleRemove(chapter: OfflineChapter) {
		// Optimistic UI — hard-delete after toast window unless user undoes.
		const prev = pendingHardDelete.get(chapter.chapterId);
		if (prev) clearTimeout(prev);

		offlineChapters = offlineChapters.filter((c) => c.chapterId !== chapter.chapterId);
		selected = new Set([...selected].filter((id) => id !== chapter.chapterId));

		let undone = false;
		showToast(`“${chapter.chapterName}” dihapus.`, 'success', {
			duration: 5500,
			action: {
				label: 'Urungkan',
				onClick: () => {
					undone = true;
					const t = pendingHardDelete.get(chapter.chapterId);
					if (t) {
						clearTimeout(t);
						pendingHardDelete.delete(chapter.chapterId);
					}
					if (!offlineChapters.some((c) => c.chapterId === chapter.chapterId)) {
						offlineChapters = [...offlineChapters, chapter].sort(
							(a, b) => b.cachedAt - a.cachedAt
						);
					}
					showToast('Penghapusan dibatalkan.', 'info');
				}
			}
		});

		const timer = setTimeout(() => {
			pendingHardDelete.delete(chapter.chapterId);
			if (undone) return;
			void removeChapterFromDevice(chapter.chapterId).then(() => refreshStorage());
		}, 5000);
		pendingHardDelete.set(chapter.chapterId, timer);
	}

	function confirmRemoveOne(chapter: OfflineChapter) {
		openConfirm({
			title: 'Hapus chapter offline?',
			body: `"${chapter.chapterName}" akan dihapus dari perangkat.`,
			onconfirm: async () => {
				scheduleRemove(chapter);
			}
		});
	}

	async function doRemoveChapters(chapters: OfflineChapter[]) {
		for (const c of chapters) await removeChapterFromDevice(c.chapterId);
		const ids = new Set(chapters.map((c) => c.chapterId));
		offlineChapters = offlineChapters.filter((c) => !ids.has(c.chapterId));
		selected = new Set([...selected].filter((id) => !ids.has(id)));
	}

	function confirmRemoveSelected() {
		const targets = offlineChapters.filter((c) => selected.has(c.chapterId));
		if (!targets.length) return;
		openConfirm({
			title: 'Hapus yang dipilih?',
			body: `${targets.length} chapter offline akan dihapus dari perangkat.`,
			onconfirm: async () => {
				await doRemoveChapters(targets);
				showToast(`${targets.length} chapter dihapus.`, 'success');
				exitSelectMode();
			}
		});
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

	function sourceLabel(sourceId?: string | null): string | null {
		if (!sourceId) return null;
		return sourceNames[sourceId] ?? null;
	}

	type OfflineGroup = { mangaId: number; mangaTitle: string; thumbnailUrl?: string | null; sourceId?: string | null; chapters: OfflineChapter[] };
	const groups = $derived.by<OfflineGroup[]>(() => {
		const map = new Map<number, OfflineGroup>();
		for (const c of offlineChapters) {
			if (!map.has(c.mangaId)) map.set(c.mangaId, { mangaId: c.mangaId, mangaTitle: c.mangaTitle, thumbnailUrl: c.thumbnailUrl, sourceId: c.sourceId, chapters: [] });
			map.get(c.mangaId)!.chapters.push(c);
		}
		return [...map.values()];
	});

	onMount(async () => {
		await refresh();
		loading = false;
		refreshStorage();
		try {
			const sources = await getInstalledSources(null);
			sourceNames = Object.fromEntries(sources.map((s) => [s.id, s.name]));
		} catch {
			// offline / server unreachable — show no source label
		}
	});
</script>

<section>
	<PageHeader
		title="Unduhan"
		subtitle={totalChapters > 0
			? `${totalChapters} chapter · ${totalPages} halaman${storageLabel ? ` · ~${storageLabel} terpakai` : ''}`
			: 'Chapter tersimpan di perangkat.'}
	>
		{#if totalChapters > 0}
			{#if selectMode}
				<Button variant="ghost" size="sm" onclick={exitSelectMode}>Batal</Button>
				<Button
					variant="danger"
					size="sm"
					disabled={selectedCount === 0}
					onclick={confirmRemoveSelected}
				>
					<Trash2 size={14} /> Hapus ({selectedCount})
				</Button>
			{:else}
				<Button variant="secondary" size="sm" onclick={() => (selectMode = true)}>
					Pilih
				</Button>
			{/if}
		{/if}
	</PageHeader>

	{#if loading}
		<div class="flex justify-center py-16 text-muted"><Spinner size={26} /></div>
	{:else if offlineChapters.length === 0}
		<EmptyState
			title="Belum ada chapter offline"
			description="Tap ikon download di chapter untuk simpan ke perangkat."
		>
			{#snippet icon()}<WifiOff size={32} />{/snippet}
		</EmptyState>
	{:else}
		<div class="space-y-2">
			{#each groups as group (group.mangaId)}
				{@const key = String(group.mangaId)}
				{@const open = openGroups.has(key)}
				{@const groupAllSelected = group.chapters.every((c) => selected.has(c.chapterId))}
				<Card padding="none">
					<div class="flex items-center gap-3 px-3 py-3">
						{#if selectMode}
							<button
								type="button"
								class="shrink-0 text-accent"
								aria-label="Pilih semua di grup"
								onclick={() => toggleSelectAllInGroup(group.chapters)}
							>
								{#if groupAllSelected}<CheckSquare size={20} />{:else}<Square size={20} />{/if}
							</button>
						{/if}
						<a
							href="/manga/{group.mangaId}"
							class="h-14 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-hover"
							aria-label="Buka detail {group.mangaTitle}"
						>
							{#if group.thumbnailUrl}
								<img src={apiUrl(group.thumbnailUrl)} alt="" class="h-full w-full object-cover" />
							{/if}
						</a>
						<div class="min-w-0 flex-1">
							<a
								href="/manga/{group.mangaId}"
								class="block truncate font-semibold text-text hover:text-accent"
							>{group.mangaTitle}</a>
							<div class="mt-0.5 flex items-center gap-2">
								{#if sourceLabel(group.sourceId)}
									<span class="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted">{sourceLabel(group.sourceId)}</span>
								{/if}
								<span class="text-xs text-muted">{group.chapters.length} chapter</span>
							</div>
						</div>
						<button
							type="button"
							onclick={() => toggleGroup(key)}
							aria-label={open ? 'Tutup daftar chapter' : 'Buka daftar chapter'}
							aria-expanded={open}
							class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-hover hover:text-text"
						>
							<ChevronDown size={16} class="transition-transform duration-200 {open ? 'rotate-180' : ''}" />
						</button>
					</div>
					{#if open}
						<div class="divide-y divide-border border-t border-border">
							{#each group.chapters as chapter (chapter.chapterId)}
								<div class="flex items-center justify-between gap-3 px-4 py-3">
									{#if selectMode}
										<button
											type="button"
											class="shrink-0 text-accent"
											aria-label="Pilih chapter"
											onclick={() => toggleSelect(chapter.chapterId)}
										>
											{#if selected.has(chapter.chapterId)}
												<CheckSquare size={18} />
											{:else}
												<Square size={18} />
											{/if}
										</button>
									{/if}
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm text-text">{chapter.chapterName}</p>
										<p class="text-xs text-muted">{chapter.pageCount} hlm · {formatDate(chapter.cachedAt)}</p>
									</div>
									{#if !selectMode}
										<div class="flex shrink-0 gap-2">
											<Button href="/read/{chapter.chapterId}" size="sm">Baca</Button>
											<Button
												variant="ghost"
												size="sm"
												onclick={() => confirmRemoveOne(chapter)}
											>
												<Trash2 size={14} />
											</Button>
										</div>
									{/if}
								</div>
							{/each}
							{#if !selectMode}
								<div class="flex gap-2 border-t border-border px-4 py-3">
									<Button variant="ghost" size="sm" onclick={() => confirmRemoveRead(group)}>
										<Trash2 size={13} /> Hapus sudah dibaca
									</Button>
									<Button variant="ghost" size="sm" onclick={() => confirmRemoveAll(group)}>
										<Trash2 size={13} /> Hapus semua
									</Button>
								</div>
							{/if}
						</div>
					{/if}
				</Card>
			{/each}
		</div>
	{/if}
</section>

<Modal bind:open={confirmOpen} title={confirmState?.title ?? ''}>
	<p class="text-sm text-muted">{confirmState?.body ?? ''}</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmOpen = false)}>Batal</Button>
		<Button variant="danger" loading={confirming} onclick={runConfirm}>Hapus</Button>
	{/snippet}
</Modal>
