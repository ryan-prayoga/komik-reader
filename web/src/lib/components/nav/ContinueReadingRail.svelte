<script lang="ts">
	import { page } from '$app/stores';
	import { apiUrl } from '$lib/graphql/client';
	import { localData } from '$lib/local/data.svelte';
	import { formatDuration } from '$lib/reading-time';
	import { imgFallback } from '$lib/utils/imgFallback';
	import Clock from '@lucide/svelte/icons/clock';
	import type { RecentChapter } from '$lib/graphql/types';

	// Home already shows its own continue-reading row — skip the rail there.
	const show = $derived($page.url.pathname !== '/');

	const recent = $derived.by<RecentChapter[]>(() => {
		if (!localData.ready) return [];
		const seen = new Set<number>();
		const out: RecentChapter[] = [];
		for (const h of localData.history) {
			if (h.isRead) continue;
			if (seen.has(h.mangaId)) continue;
			seen.add(h.mangaId);
			out.push({
				id: h.chapterId,
				name: h.chapterName,
				mangaId: h.mangaId,
				lastPageRead: h.lastPage,
				totalPages: h.totalPages,
				lastReadAt: '',
				manga: { id: h.mangaId, title: h.mangaTitle, thumbnailUrl: h.thumbnailUrl }
			});
			if (out.length >= 5) break;
		}
		return out;
	});

	function chapterDuration(chapterId: number): string | null {
		const ms = localData.history.find((h) => h.chapterId === chapterId)?.timeSpentMs ?? 0;
		return ms > 0 ? formatDuration(ms) : null;
	}

	function progressPct(ch: RecentChapter): number | null {
		if (!ch.totalPages || ch.totalPages <= 1) return null;
		if (ch.lastPageRead <= 0) return null;
		if (ch.lastPageRead >= ch.totalPages - 1) return null;
		return Math.round(((ch.lastPageRead + 1) / ch.totalPages) * 100);
	}
</script>

{#if show && recent.length > 0}
	<aside
		class="sticky top-0 hidden h-screen w-72 shrink-0 flex-col overflow-y-auto border-l border-border px-4 py-8 2xl:flex"
		aria-label="Lanjut baca"
	>
		<h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Lanjut Baca</h2>
		<div class="flex flex-col gap-2">
			{#each recent as chapter (chapter.id)}
				{@const dur = chapterDuration(chapter.id)}
				{@const pct = progressPct(chapter)}
				<a
					href="/read/{chapter.id}"
					class="group flex items-center gap-3 rounded-[var(--radius)] p-2 transition hover:bg-surface"
				>
					<div class="relative h-14 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface">
						{#if chapter.manga.thumbnailUrl}
							<img
								src={apiUrl(chapter.manga.thumbnailUrl)}
								alt={chapter.manga.title}
								class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
								loading="lazy"
								use:imgFallback
							/>
						{/if}
						{#if pct != null}
							<div class="absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
								<div class="h-full bg-accent" style="width: {pct}%"></div>
							</div>
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<p class="line-clamp-1 text-sm font-medium text-text">{chapter.manga.title}</p>
						<p class="line-clamp-1 text-xs text-muted">{chapter.name}</p>
						{#if pct != null}
							<p class="mt-0.5 text-[11px] tabular-nums text-muted">{pct}%</p>
						{:else if dur}
							<p class="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
								<Clock size={10} class="shrink-0" />
								<span>{dur}</span>
							</p>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	</aside>
{/if}
