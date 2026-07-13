<script lang="ts">
	import { page } from '$app/stores';
	import { apiUrl } from '$lib/graphql/client';
	import {
		buildContinueReading,
		continueProgressPct,
		isFinishedStale,
		resolveContinueStatus,
		type ContinueUpdateMeta
	} from '$lib/continue-reading';
	import { localData } from '$lib/local/data.svelte';
	import { updates } from '$lib/updates/updates.svelte';
	import { formatDuration } from '$lib/reading-time';
	import { imgFallback } from '$lib/utils/imgFallback';
	import Clock from '@lucide/svelte/icons/clock';
	import type { RecentChapter } from '$lib/graphql/types';

	// Home already shows its own continue-reading row — skip the rail there.
	const show = $derived($page.url.pathname !== '/');

	// Kept even when the latest chapter was finished (see continue-reading.ts) so
	// the entry doesn't vanish the moment a chapter is completed.
	const recent = $derived.by<RecentChapter[]>(() =>
		localData.ready ? buildContinueReading(localData.history, 5) : []
	);

	// Drop cards that are fully read and haven't been touched in a while —
	// "sudah baca semua" is a koleksi concern, Lanjut Baca is for active reading.
	const visible = $derived.by(() =>
		recent.filter((chapter) => {
			const status = statusOf(chapter);
			const lastActivityAt =
				localData.history.find((h) => h.chapterId === chapter.id)?.updatedAt ?? 0;
			return !isFinishedStale(status.kind, lastActivityAt, Date.now());
		})
	);

	function chapterDuration(chapterId: number): string | null {
		const ms = localData.history.find((h) => h.chapterId === chapterId)?.timeSpentMs ?? 0;
		return ms > 0 ? formatDuration(ms) : null;
	}

	function historyFor(mangaId: number) {
		return localData.history
			.filter((h) => h.mangaId === mangaId)
			.map((h) => ({
				chapterId: h.chapterId,
				chapterNumber: h.chapterNumber,
				isRead: h.isRead
			}));
	}

	function updateMetaFor(mangaId: number): ContinueUpdateMeta | null {
		const item = updates.get(mangaId);
		if (!item) return null;
		return {
			latestChapterId: item.latestChapterId,
			latestChapterNumber: item.latestChapterNumber,
			latestChapterName: item.latestChapterName,
			mangaStatus: item.mangaStatus,
			hasUpdate: item.hasUpdate
		};
	}

	function statusOf(chapter: RecentChapter) {
		const lastHist = localData.history.find((h) => h.chapterId === chapter.id);
		return resolveContinueStatus({
			lastChapter: {
				id: chapter.id,
				name: chapter.name,
				mangaId: chapter.mangaId,
				isRead: chapter.isRead,
				chapterNumber: lastHist?.chapterNumber
			},
			historyForManga: historyFor(chapter.mangaId),
			updateMeta: updateMetaFor(chapter.mangaId)
		});
	}
</script>

{#if show && visible.length > 0}
	<aside
		class="sticky top-0 hidden h-screen w-72 shrink-0 flex-col overflow-y-auto border-l border-border px-4 py-8 2xl:flex"
		aria-label="Lanjut baca"
	>
		<h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Lanjut Baca</h2>
		<div class="flex flex-col gap-2">
			{#each visible as chapter (chapter.id)}
				{@const dur = chapterDuration(chapter.id)}
				{@const pct = continueProgressPct(chapter)}
				{@const status = statusOf(chapter)}
				<a
					href={status.href}
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
						<p class="line-clamp-1 text-xs text-muted">
							{status.kind === 'selesai' || status.kind === 'tamat' ? chapter.name : status.subtitle}
						</p>
						{#if status.kind === 'baru'}
							<p class="mt-0.5 text-[11px] text-accent">Chapter baru</p>
						{:else if pct != null}
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
