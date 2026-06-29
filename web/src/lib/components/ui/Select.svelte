<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	interface Props {
		value?: string;
		label?: string;
		id?: string;
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	}

	let {
		value = $bindable(''),
		label,
		id,
		class: klass = '',
		children,
		...rest
	}: Props = $props();
</script>

<div class="flex flex-col gap-1.5 {klass}">
	{#if label}
		<label for={id} class="text-sm font-medium text-text">{label}</label>
	{/if}
	<div class="relative">
		<select
			{id}
			bind:value
			class="w-full appearance-none rounded-[var(--radius)] border border-border bg-surface px-3 py-2 pr-9 text-sm text-text outline-none transition focus:border-accent"
			{...rest}
		>
			{@render children?.()}
		</select>
		<ChevronDown
			size={16}
			class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
		/>
	</div>
</div>
