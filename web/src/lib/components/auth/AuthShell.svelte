<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		children: Snippet;
		footer?: Snippet;
	}
	let { title, subtitle, children, footer }: Props = $props();
</script>

<div class="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center">
	<div class="mb-6 flex flex-col items-center text-center">
		<span class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-white shadow-(--shadow-pop)">
			K
		</span>
		<h1 class="text-2xl font-bold tracking-tight text-text">{title}</h1>
		{#if subtitle}<p class="mt-1 text-sm text-muted">{subtitle}</p>{/if}
	</div>

	<div class="rounded-2xl border border-border bg-surface p-6 shadow-(--shadow-pop) sm:p-8">
		{@render children()}
	</div>

	{#if footer}
		<div class="mt-4 text-center text-sm text-muted">{@render footer()}</div>
	{/if}
</div>
