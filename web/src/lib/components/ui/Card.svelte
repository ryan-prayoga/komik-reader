<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		href?: string;
		padding?: 'none' | 'sm' | 'md' | 'lg';
		hover?: boolean;
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	}

	let {
		href,
		padding = 'md',
		hover = false,
		class: klass = '',
		children,
		...rest
	}: Props = $props();

	const pad = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' };
	const base = 'panel-cut border-[1.5px] border-border bg-surface shadow-(--shadow-card)';
	const cls = $derived(
		`${base} ${pad[padding]} ${hover ? 'transition hover:border-accent/40 hover:bg-surface-hover' : ''} ${klass}`
	);
</script>

{#if href}
	<a {href} class="block {cls}" {...rest}>{@render children?.()}</a>
{:else}
	<div class={cls} {...rest}>{@render children?.()}</div>
{/if}
