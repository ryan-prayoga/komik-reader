<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		href?: string;
		selected?: boolean;
		dashed?: boolean;
		onclick?: (e: MouseEvent) => void;
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	}

	let {
		href,
		selected = false,
		dashed = false,
		onclick,
		class: klass = '',
		children,
		...rest
	}: Props = $props();

	const base = 'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition';
	const cls = $derived.by(() => {
		const tone = dashed
			? 'border-dashed border-border text-muted hover:border-accent hover:text-accent'
			: selected
				? 'border-accent bg-accent/15 text-accent'
				: 'border-border text-muted hover:border-accent/40 hover:text-text';
		return `${base} ${tone} ${klass}`;
	});
</script>

{#if href}
	<a {href} class={cls} {...rest}>{@render children?.()}</a>
{:else}
	<button type="button" {onclick} class={cls} {...rest}>{@render children?.()}</button>
{/if}
