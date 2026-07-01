<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { localData } from '$lib/local/data.svelte';
	import { syncEngine } from '$lib/local/sync.svelte';
	import { getInstalledSources } from '$lib/graphql/api';
	import { relativeTime as formatDate } from '$lib/utils/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button, Card, Badge, EmptyState } from '$lib/components/ui';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Cloud from '@lucide/svelte/icons/cloud';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Clock from '@lucide/svelte/icons/clock';
	import Flag from '@lucide/svelte/icons/flag';
	import type { LocalHistory } from '$lib/local/types';

	type Group = {
		mangaId: number;
		mangaTitle: string;
		thumbnailUrl: string | null;
		sourceId: string | null;
		lastChapterId: number;
		lastChapterName: string;
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
					<div
						class="flex cursor-pointer items-center gap-4 px-4 py-3 transition hover:bg-bg/60"
						role="button"
						tabindex="0"
						onclick={() => goto(`/read/${g.lastChapterId}`)}
						onkeydown={(e) => e.key === 'Enter' && goto(`/read/${g.lastChapterId}`)}
					>
						<div class="h-16 w-11 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-bg">
							{#if g.thumbnailUrl}
								<img src={g.thumbnailUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-text">{g.mangaTitle}</p>
							<p class="flex items-center gap-1 text-xs text-muted">
								{#if sourceLabel(g)}<span class="shrink-0">{sourceLabel(g)} ·</span>{/if}
								<BookOpen size={12} class="shrink-0" />
								<span class="min-w-0 flex-1 truncate">{g.lastChapterName}</span>
							</p>
							<p class="flex items-center gap-1 text-[11px] text-muted">
								<Clock size={11} class="shrink-0" />
								<span>{formatDate(g.lastReadAt)}</span>
								{#if g.furthestRead != null}
									<Flag size={11} class="shrink-0" />
									<span>Ch {g.furthestRead}</span>
								{/if}
							</p>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onclick={(e: MouseEvent) => {
								e.stopPropagation();
								localData.removeHistoryByManga(g.mangaId);
							}}
						>
							<Trash2 size={14} />
						</Button>
					</div>
				{/each}
			</div>
		</Card>
	{/if}
</section>
