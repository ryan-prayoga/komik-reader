<script lang="ts">
	import { apiUrl } from '$lib/graphql/client';
	import {
		continueProgressPct,
		isFinishedStale,
		resolveContinueStatus,
		type ContinueUpdateMeta
	} from '$lib/continue-reading';
	import { localData } from '$lib/local/data.svelte';
	import { updates } from '$lib/updates/updates.svelte';
	import { imgFallback } from '$lib/utils/imgFallback';
	import Play from '@lucide/svelte/icons/play';
	import type { RecentChapter } from '$lib/graphql/types';

	interface Props {
		chapters: RecentChapter[];
		title?: string;
		seeAllHref?: string;
	}
	let { chapters, title = 'Lanjut Baca', seeAllHref }: Props = $props();

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

	// Drop cards that are fully read and haven't been touched in a while —
	// "sudah baca semua" is a koleksi concern, Lanjut Baca is for active reading.
	const visible = $derived.by(() =>
		chapters.filter((chapter) => {
			const status = statusOf(chapter);
			const lastActivityAt =
				localData.history.find((h) => h.chapterId === chapter.id)?.updatedAt ?? 0;
			return !isFinishedStale(status.kind, lastActivityAt, Date.now());
		})
	);
</script>

{#if visible.length > 0}
	<section class="mb-8">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-text">{title}</h2>
			{#if seeAllHref}
				<a href={seeAllHref} class="text-sm text-accent hover:underline">Semua →</a>
			{/if}
		</div>
		<div class="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
			{#each visible as chapter (chapter.id)}
				{@const pct = continueProgressPct(chapter)}
				{@const status = statusOf(chapter)}
				<a
					href={status.href}
					class="group relative w-32 shrink-0 overflow-hidden rounded-[var(--radius)] border border-border bg-surface shadow-(--shadow-card) transition hover:border-accent/40 sm:w-36"
				>
					<div class="relative aspect-[3/4] overflow-hidden bg-bg">
						{#if chapter.manga.thumbnailUrl}
							<img
								src={apiUrl(chapter.manga.thumbnailUrl)}
								alt={chapter.manga.title}
								class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
								loading="lazy"
								use:imgFallback
							/>
						{/if}
						{#if status.kind === 'lanjut' || status.kind === 'baru'}
							<span
								class="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow {status.badgeClass}"
							>
								{status.label}
							</span>
						{/if}
						<div class="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
							<span
								class="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white opacity-90 shadow transition group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
							>
								<Play size={16} fill="currentColor" />
							</span>
						</div>
						{#if pct !== null}
							<div class="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 text-right">
								<span class="text-[10px] font-medium text-white/90">{pct}%</span>
							</div>
							<div class="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20">
								<div class="h-full bg-accent" style="width: {pct}%"></div>
							</div>
						{/if}
					</div>
					<div class="p-2">
						<p class="line-clamp-1 text-xs font-medium text-text">{chapter.manga.title}</p>
						<p class="line-clamp-1 text-[11px] text-muted">
							{status.kind === 'selesai' || status.kind === 'tamat' ? chapter.name : status.subtitle}
						</p>
					</div>
				</a>
			{/each}
		</div>
	</section>
{/if}
