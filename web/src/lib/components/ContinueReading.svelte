<script lang="ts">
	import { apiUrl } from '$lib/graphql/client';
	import Play from '@lucide/svelte/icons/play';
	import type { RecentChapter } from '$lib/graphql/types';

	interface Props {
		chapters: RecentChapter[];
		title?: string;
		seeAllHref?: string;
	}
	let { chapters, title = 'Lanjut Baca', seeAllHref }: Props = $props();

	function progressPct(ch: RecentChapter): number | null {
		if (!ch.totalPages || ch.totalPages <= 1) return null;
		if (ch.lastPageRead <= 0) return null;
		if (ch.lastPageRead >= ch.totalPages - 1) return null;
		return Math.round(((ch.lastPageRead + 1) / ch.totalPages) * 100);
	}
</script>

{#if chapters.length > 0}
	<section class="mb-8">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-text">{title}</h2>
			{#if seeAllHref}
				<a href={seeAllHref} class="text-sm text-accent hover:underline">Semua →</a>
			{/if}
		</div>
		<div class="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
			{#each chapters as chapter (chapter.id)}
				{@const pct = progressPct(chapter)}
				<a
					href="/read/{chapter.id}"
					class="group relative w-32 shrink-0 overflow-hidden rounded-[var(--radius)] border border-border bg-surface shadow-(--shadow-card) transition hover:border-accent/40 sm:w-36"
				>
					<div class="relative aspect-[3/4] overflow-hidden bg-bg">
						{#if chapter.manga.thumbnailUrl}
							<img
								src={apiUrl(chapter.manga.thumbnailUrl)}
								alt={chapter.manga.title}
								class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
								loading="lazy"
							/>
						{/if}
						<div class="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
							<span class="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white opacity-0 transition group-hover:opacity-100">
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
						<p class="line-clamp-1 text-[11px] text-muted">{chapter.name}</p>
					</div>
				</a>
			{/each}
		</div>
	</section>
{/if}
