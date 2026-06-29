<script lang="ts">
	import type { Manga } from '$lib/graphql/types';
	import { apiUrl } from '$lib/graphql/client';
	import ImageOff from '@lucide/svelte/icons/image-off';

	interface Props {
		manga: Manga;
		href: string;
		/** Optional corner badge, e.g. unread chapter count. */
		badge?: string | number;
		/** Optional secondary line under the title (author, source, etc.). */
		subtitle?: string;
	}

	let { manga, href, badge, subtitle }: Props = $props();
</script>

<a
	{href}
	class="group relative flex flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-surface shadow-(--shadow-card) transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-hover hover:shadow-(--shadow-pop) active:scale-[0.98]"
>
	<div class="relative aspect-[3/4] overflow-hidden bg-bg">
		{#if manga.thumbnailUrl}
			<img
				src={apiUrl(manga.thumbnailUrl)}
				alt={manga.title}
				class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
				loading="lazy"
			/>
		{:else}
			<div class="flex h-full items-center justify-center text-muted">
				<ImageOff size={28} />
			</div>
		{/if}
		<div
			class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition group-hover:opacity-100"
		></div>
		{#if badge !== undefined && badge !== 0}
			<span
				class="absolute right-2 top-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white shadow"
			>
				{badge}
			</span>
		{/if}
	</div>
	<div class="p-3">
		<h3 class="line-clamp-2 text-sm font-medium leading-snug text-text">{manga.title}</h3>
		{#if subtitle}
			<p class="mt-0.5 truncate text-xs text-muted">{subtitle}</p>
		{/if}
	</div>
</a>
