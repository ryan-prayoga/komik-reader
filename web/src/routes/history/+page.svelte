<script lang="ts">
	import { onMount } from 'svelte';
	import { localData } from '$lib/local/data.svelte';
	import { syncEngine } from '$lib/local/sync.svelte';
	import { getInstalledSources } from '$lib/graphql/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Card, Badge, EmptyState } from '$lib/components/ui';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Cloud from '@lucide/svelte/icons/cloud';
	import type { LocalHistory } from '$lib/local/types';

	type Group = {
		mangaId: number;
		mangaTitle: string;
		thumbnailUrl: string | null;
		sourceId: string | null;
		lastChapterId: number;
		lastChapterName: string;
		lastPage: number;
		lastReadAt: number;
		furthestRead: number | null;
		count: number;
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
			const readNums = rows
				.filter((r) => r.isRead && r.chapterNumber != null)
				.map((r) => r.chapterNumber as number);
			out.push({
				mangaId,
				mangaTitle: recent.mangaTitle,
				thumbnailUrl: recent.thumbnailUrl,
				sourceId: rows.find((r) => r.sourceId)?.sourceId ?? librarySource.get(mangaId) ?? null,
				lastChapterId: recent.chapterId,
				lastChapterName: recent.chapterName,
				lastPage: recent.lastPage,
				lastReadAt: recent.updatedAt,
				furthestRead: readNums.length ? Math.max(...readNums) : null,
				count: rows.length
			});
		}
		return out.sort((a, b) => b.lastReadAt - a.lastReadAt);
	});

	function sourceLabel(g: Group): string | null {
		if (!g.sourceId) return null;
		return sourceNames[g.sourceId] ?? null;
	}

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

	{#if groups.length === 0}
		<EmptyState
			title="Belum ada riwayat"
			description="Buka chapter di reader untuk mencatat riwayat baca otomatis."
		/>
	{:else}
		<Card padding="none">
			<div class="divide-y divide-border">
				{#each groups as g (g.mangaId)}
					<div class="flex flex-wrap items-center gap-4 px-4 py-3">
						<a href="/manga/{g.mangaId}" class="h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-bg">
							{#if g.thumbnailUrl}
								<img src={g.thumbnailUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
							{/if}
						</a>
						<a href="/manga/{g.mangaId}" class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-text">{g.mangaTitle}</p>
							<p class="truncate text-xs text-muted">
								{#if sourceLabel(g)}{sourceLabel(g)} · {/if}Terakhir: {g.lastChapterName}
								{#if g.lastPage > 0} · hal. {g.lastPage + 1}{/if}
							</p>
							<p class="truncate text-[11px] text-muted">
								{#if g.furthestRead != null}Sampai ch {g.furthestRead} · {/if}{formatDate(g.lastReadAt)}
							</p>
						</a>
						<div class="flex shrink-0 items-center gap-2">
							<Button href="/read/{g.lastChapterId}" size="sm">Lanjut</Button>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => localData.removeHistoryByManga(g.mangaId)}
							>
								<Trash2 size={14} />
							</Button>
						</div>
					</div>
				{/each}
			</div>
		</Card>
	{/if}
</section>
