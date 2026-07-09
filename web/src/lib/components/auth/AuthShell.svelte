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
		<span
			class="panel-cut [--panel-cut:8px] mb-3 flex h-12 w-12 items-center justify-center bg-accent text-lg font-bold text-white shadow-(--shadow-pop)"
		>
			K
		</span>
		<p class="mb-1 font-display text-sm font-bold uppercase tracking-tight text-muted">
			Komik<span class="text-accent">Reader</span>
		</p>
		<h1 class="font-display text-3xl font-bold uppercase tracking-tight text-text">{title}</h1>
		{#if subtitle}<p class="mt-1 text-sm text-muted">{subtitle}</p>{/if}
	</div>

	<div class="panel-cut border-[1.5px] border-border bg-surface p-6 shadow-(--shadow-pop) sm:p-8">
		{@render children()}
	</div>

	{#if footer}
		<div class="mt-4 text-center text-sm text-muted">{@render footer()}</div>
	{/if}
</div>
