<script lang="ts">
	import type { Manga } from '$lib/graphql/types';
	import { apiUrl } from '$lib/graphql/client';

	interface Props {
		manga: Manga;
		href: string;
	}

	let { manga, href }: Props = $props();
</script>

<a
	{href}
	class="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition hover:border-accent/40 hover:bg-surface-hover"
>
	<div class="aspect-[3/4] overflow-hidden bg-bg">
		{#if manga.thumbnailUrl}
			<img
				src={apiUrl(manga.thumbnailUrl)}
				alt={manga.title}
				class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
				loading="lazy"
			/>
		{:else}
			<div class="flex h-full items-center justify-center text-sm text-muted">No cover</div>
		{/if}
	</div>
	<div class="p-3">
		<h3 class="line-clamp-2 text-sm font-medium leading-snug">{manga.title}</h3>
	</div>
</a>