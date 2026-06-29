<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'solid' | 'ghost' | 'surface';
	type Size = 'sm' | 'md' | 'lg';

	interface Props {
		variant?: Variant;
		size?: Size;
		href?: string;
		type?: 'button' | 'submit' | 'reset';
		label: string;
		disabled?: boolean;
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	}

	let {
		variant = 'ghost',
		size = 'md',
		href,
		type = 'button',
		label,
		disabled = false,
		class: klass = '',
		children,
		...rest
	}: Props = $props();

	const base =
		'inline-flex items-center justify-center rounded-[var(--radius)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-50';

	const variants: Record<Variant, string> = {
		solid: 'bg-accent text-white hover:bg-accent-hover',
		surface: 'border border-border bg-surface text-text hover:bg-surface-hover',
		ghost: 'text-muted hover:bg-surface hover:text-text'
	};

	const sizes: Record<Size, string> = {
		sm: 'h-8 w-8',
		md: 'h-10 w-10',
		lg: 'h-12 w-12'
	};

	const cls = $derived(`${base} ${variants[variant]} ${sizes[size]} ${klass}`);
</script>

{#if href}
	<a {href} class={cls} aria-label={label} title={label} {...rest}>
		{@render children?.()}
	</a>
{:else}
	<button {type} class={cls} aria-label={label} title={label} {disabled} {...rest}>
		{@render children?.()}
	</button>
{/if}
