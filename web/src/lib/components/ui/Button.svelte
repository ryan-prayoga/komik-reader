<script lang="ts">
	import type { Snippet } from 'svelte';
	import Spinner from './Spinner.svelte';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type Size = 'sm' | 'md' | 'lg';

	interface Props {
		variant?: Variant;
		size?: Size;
		href?: string;
		type?: 'button' | 'submit' | 'reset';
		loading?: boolean;
		disabled?: boolean;
		block?: boolean;
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	}

	let {
		variant = 'primary',
		size = 'md',
		href,
		type = 'button',
		loading = false,
		disabled = false,
		block = false,
		class: klass = '',
		children,
		...rest
	}: Props = $props();

	const base =
		'inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-50';

	const variants: Record<Variant, string> = {
		primary: 'bg-accent text-white hover:bg-accent-hover',
		secondary: 'border border-border bg-surface text-text hover:bg-surface-hover',
		ghost: 'text-muted hover:bg-surface hover:text-text',
		danger: 'bg-danger text-white hover:opacity-90'
	};

	const sizes: Record<Size, string> = {
		sm: 'px-3 py-1.5 text-xs',
		md: 'px-4 py-2 text-sm',
		lg: 'px-5 py-2.5 text-base'
	};

	const cls = $derived(
		`${base} ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${klass}`
	);
</script>

{#if href}
	<a {href} class={cls} aria-disabled={disabled} {...rest}>
		{#if loading}<Spinner size={size === 'lg' ? 18 : 14} />{/if}
		{@render children?.()}
	</a>
{:else}
	<button {type} class={cls} disabled={disabled || loading} {...rest}>
		{#if loading}<Spinner size={size === 'lg' ? 18 : 14} />{/if}
		{@render children?.()}
	</button>
{/if}
