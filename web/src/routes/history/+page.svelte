<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { localData } from '$lib/local/data.svelte';
	import { syncEngine } from '$lib/local/sync.svelte';
	import { getInstalledSources } from '$lib/graphql/api';
	import { relativeTime as formatDate } from '$lib/utils/format';
	import { imgFallback } from '$lib/utils/imgFallback';
	import { formatDuration } from '$lib/reading-time';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Card, Badge, EmptyState, Modal } from '$lib/components/ui';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Cloud from '@lucide/svelte/icons/cloud';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Clock from '@lucide/svelte/icons/clock';
	import type { LocalHistory } from '$lib/local/types';

	type Group = {
		mangaId: number;
		mangaTitle: string;
		thumbnailUrl: string | null;
		sourceId: string | null;
		lastChapterId: number;
		lastChapterName: string;
		lastReadAt: number;
		progressPercent: number | null;
		count: number;
		totalMs: number;
	};

	// sourceId → human-readable source name (best-effort; needs Suwayomi online).
	let sourceNames = $state<Record<string, string>>({});

	onMount(async () => {
		try {
			const sources = await getInstalledSources(null);
			sourceNames = Object.fromEntries(sources.map((s) => [s.id, s.name]));
		} catch {
			// offline / guest without reachable server — show no source label
		}
	});

	// Fallback sourceId from the library when a history row predates sourceId.
	const librarySource = $derived(
		new Map(localData.library.map((l) => [l.mangaId, l.sourceId]))
	);

	const groups = $derived.by<Group[]>(() => {
		const byManga = new Map<number, LocalHistory[]>();
		for (const h of localData.history) {
			const list = byManga.get(h.mangaId) ?? [];
			list.push(h);
			byManga.set(h.mangaId, list);
		}
		const out: Group[] = [];
		for (const [mangaId, rows] of byManga) {
			// Most recently touched row = where the user left off (continue point).
			const recent = rows.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
			const progressPercent = recent.isRead
				? 100
				: recent.totalPages
					? Math.min(100, Math.round(((recent.lastPage + 1) / recent.totalPages) * 100))
					: null;
			const totalMs = rows.reduce((acc, r) => acc + (r.timeSpentMs ?? 0), 0);
			// Newest row that actually carries a sourceId — not just the first
			// match, so an older chapter read from a different source can't
			// override the label a more recent read implies.
			const sourceRow = rows
				.filter((r) => r.sourceId)
				.reduce<LocalHistory | null>(
					(a, b) => (!a || b.updatedAt > a.updatedAt ? b : a),
					null
				);
			out.push({
				mangaId,
				mangaTitle: recent.mangaTitle,
				thumbnailUrl: recent.thumbnailUrl,
				sourceId: sourceRow?.sourceId ?? librarySource.get(mangaId) ?? null,
				lastChapterId: recent.chapterId,
				lastChapterName: recent.chapterName,
				lastReadAt: recent.updatedAt,
				progressPercent,
				count: rows.length,
				totalMs
			});
		}
		return out.sort((a, b) => b.lastReadAt - a.lastReadAt);
	});

	// Bucket groups into human date sections (Hari ini / Kemarin / Minggu ini / Lama).
	function dateBucket(ts: number): string {
		const now = new Date();
		const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const d = ts;
		if (d >= startToday) return 'Hari ini';
		if (d >= startToday - 86400000) return 'Kemarin';
		if (d >= startToday - 6 * 86400000) return 'Minggu ini';
		return 'Lebih lama';
	}

	const sections = $derived.by(() => {
		const out: { label: string; items: Group[] }[] = [];
		for (const g of groups) {
			const label = dateBucket(g.lastReadAt);
			let sec = out.find((s) => s.label === label);
			if (!sec) {
				sec = { label, items: [] };
				out.push(sec);
			}
			sec.items.push(g);
		}
		return out;
	});

	let confirmClearAll = $state(false);

	function sourceLabel(g: Group): string | null {
		if (!g.sourceId) return null;
		return sourceNames[g.sourceId] ?? null;
	}

	// Confirm before wiping a manga's whole history — a single misplaced tap
	// otherwise deletes every row for that series.
	let confirmOpen = $state(false);
	let pendingDelete = $state<Group | null>(null);

	function askDelete(g: Group) {
		pendingDelete = g;
		confirmOpen = true;
	}
	function confirmDelete() {
		if (pendingDelete) localData.removeHistoryByManga(pendingDelete.mangaId);
		confirmOpen = false;
		pendingDelete = null;
	}

	function doClearAll() {
		localData.clearAllHistory();
		confirmClearAll = false;
	}

	function openGroup(g: Group) {
		goto(`/read/${g.lastChapterId}`);
	}
</script>

<section>
	<PageHeader title="Riwayat" subtitle="Tersimpan di perangkat ini. Login untuk sync antar device.">
		{#if groups.length > 0}
			<Button variant="ghost" size="sm" onclick={() => (confirmClearAll = true)}>
				<Trash2 size={14} /> Hapus semua
			</Button>
		{/if}
		{#if syncEngine.loggedIn}
			<Badge tone="success"><Cloud size={13} /> Tersync</Badge>
		{:else}
			<Button href="/login" variant="secondary" size="sm">Login untuk sync</Button>
		{/if}
	</PageHeader>

	{#if groups.length === 0}
		<EmptyState
			title="Belum ada riwayat"
			description="Buka chapter di reader untuk mencatat riwayat baca otomatis."
		>
			{#snippet action()}
				<div class="flex flex-wrap justify-center gap-2">
					<Button href="/search">Cari komik</Button>
					<Button href="/" variant="secondary">Ke beranda</Button>
				</div>
			{/snippet}
		</EmptyState>
	{:else}
		{#each sections as section (section.label)}
			<h2 class="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0">
				{section.label}
			</h2>
			<Card padding="none" class="mb-2">
				<div class="divide-y divide-border">
					{#each section.items as g (g.mangaId)}
					<div
						class="flex items-center gap-4 px-4 py-3 transition hover:bg-bg/60"
					>
						<a
							href="/manga/{g.mangaId}"
							class="h-16 w-11 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-bg"
							aria-label="Buka detail {g.mangaTitle}"
						>
							{#if g.thumbnailUrl}
								<img
									src={g.thumbnailUrl}
									alt=""
									class="h-full w-full object-cover"
									loading="lazy"
									use:imgFallback
								/>
							{/if}
						</a>
						<button type="button" onclick={() => openGroup(g)} class="min-w-0 flex-1 cursor-pointer text-left">
							<p class="truncate text-sm font-medium text-text">{g.mangaTitle}</p>
							<p class="flex items-center gap-1 text-xs text-muted">
								{#if sourceLabel(g)}<span class="shrink-0">{sourceLabel(g)} ·</span>{/if}
								<BookOpen size={12} class="shrink-0" />
								<span class="flex min-w-0 flex-1 items-center gap-1">
									<span class="truncate">{g.lastChapterName}</span>
									{#if g.progressPercent != null}
										<span class="shrink-0">· {g.progressPercent}%</span>
									{/if}
								</span>
							</p>
							<p class="flex items-center gap-1 text-[11px] text-muted">
								<Clock size={11} class="shrink-0" />
								<span>{formatDate(g.lastReadAt)}</span>
							</p>
							{#if g.totalMs > 0}
								<p class="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
									<span class="inline-block h-1 w-1 rounded-full bg-muted/60"></span>
									<span>Total {formatDuration(g.totalMs)}</span>
								</p>
							{/if}
						</button>
						<Button
							variant="ghost"
							size="sm"
							onclick={(e: MouseEvent) => {
								e.stopPropagation();
								askDelete(g);
							}}
						>
							<Trash2 size={14} />
						</Button>
					</div>
				{/each}
			</div>
		</Card>
		{/each}
	{/if}
</section>

<Modal bind:open={confirmOpen} title="Hapus riwayat?">
	<p class="text-sm text-muted">
		Semua riwayat baca untuk "{pendingDelete?.mangaTitle ?? ''}" akan dihapus dari perangkat ini.
	</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmOpen = false)}>Batal</Button>
		<Button variant="danger" onclick={confirmDelete}>Hapus</Button>
	{/snippet}
</Modal>

<Modal bind:open={confirmClearAll} title="Hapus semua riwayat?">
	<p class="text-sm text-muted">
		Seluruh riwayat baca di perangkat ini akan dihapus. Tindakan ini tidak bisa dibatalkan.
	</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmClearAll = false)}>Batal</Button>
		<Button variant="danger" onclick={doClearAll}>Hapus semua</Button>
	{/snippet}
</Modal>
