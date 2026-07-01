<script lang="ts">
	import { onMount } from 'svelte';
	import { getInstalledSources } from '$lib/graphql/api';
	import { removeChapterFromDevice } from '$lib/offline/cache';
	import { listOfflineChapters, type OfflineChapter } from '$lib/offline/db';
	import { apiUrl } from '$lib/graphql/client';
	import { localData } from '$lib/local/data.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Card, EmptyState, Spinner, Modal } from '$lib/components/ui';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

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

	// sourceId → human-readable source name (best-effort; needs Suwayomi online).
	let sourceNames = $state<Record<string, string>>({});

	async function refresh() {
		offlineChapters = await listOfflineChapters();
	}

	async function removeFromDevice(chapterId: number) {
		await removeChapterFromDevice(chapterId);
		offlineChapters = offlineChapters.filter((c) => c.chapterId !== chapterId);
		showToast('Chapter dihapus.', 'success');
	}

	async function doRemoveChapters(chapters: OfflineChapter[]) {
		for (const c of chapters) await removeChapterFromDevice(c.chapterId);
		const ids = new Set(chapters.map((c) => c.chapterId));
		offlineChapters = offlineChapters.filter((c) => !ids.has(c.chapterId));
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
		try {
			const sources = await getInstalledSources(null);
			sourceNames = Object.fromEntries(sources.map((s) => [s.id, s.name]));
		} catch {
			// offline / server unreachable — show no source label
		}
	});
</script>

<section>
	<PageHeader title="Downloads" subtitle="Chapter tersimpan di perangkat." />

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
								{#if sourceLabel(group.sourceId)}
									<span class="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted">{sourceLabel(group.sourceId)}</span>
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
</section>

<Modal bind:open={confirmOpen} title={confirmState?.title ?? ''}>
	<p class="text-sm text-muted">{confirmState?.body ?? ''}</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmOpen = false)}>Batal</Button>
		<Button loading={confirming} onclick={runConfirm}>Hapus</Button>
	{/snippet}
</Modal>
