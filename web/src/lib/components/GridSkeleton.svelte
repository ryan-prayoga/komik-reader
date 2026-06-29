<script lang="ts">
	import MangaGrid from './MangaGrid.svelte';

	interface Props {
		count?: number;
	}
	let { count = 10 }: Props = $props();
</script>

<MangaGrid>
	{#each Array(count) as _, i (i)}
		<div class="overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
			<div class="aspect-[3/4] animate-pulse bg-surface-hover"></div>
			<div class="space-y-2 p-3">
				<div class="h-3 w-4/5 animate-pulse rounded bg-surface-hover"></div>
				<div class="h-3 w-2/5 animate-pulse rounded bg-surface-hover"></div>
			</div>
		</div>
	{/each}
</MangaGrid>
