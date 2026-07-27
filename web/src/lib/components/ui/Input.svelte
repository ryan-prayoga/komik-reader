<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		value?: string;
		label?: string;
		type?: string;
		placeholder?: string;
		error?: string;
		id?: string;
		icon?: Snippet;
		class?: string;
		[key: string]: unknown;
	}

	let {
		value = $bindable(''),
		label,
		type = 'text',
		placeholder,
		error,
		id,
		icon,
		class: klass = '',
		...rest
	}: Props = $props();

	const fieldBase =
		'w-full rounded-[var(--radius)] border bg-surface px-3 py-2 text-sm text-text outline-none transition placeholder:text-muted focus:border-accent';
	const borderCls = $derived(error ? 'border-danger' : 'border-border');

	// Callers that pass `label` without `id` rendered `for=undefined`: clicking the
	// label did nothing and the field lost its accessible name. Generate one.
	const fallbackId = 'input-' + Math.random().toString(36).slice(2, 8);
	const fieldId = $derived(id ?? fallbackId);
</script>

<div class="flex flex-col gap-1.5 {klass}">
	{#if label}
		<label for={fieldId} class="text-sm font-medium text-text">{label}</label>
	{/if}
	<div class="relative">
		{#if icon}
			<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
				{@render icon()}
			</span>
		{/if}
		<input
			id={fieldId}
			{type}
			{placeholder}
			bind:value
			class="{fieldBase} {borderCls} {icon ? 'pl-9' : ''}"
			aria-invalid={!!error}
			aria-describedby={error ? `${fieldId}-err` : undefined}
			{...rest}
		/>
	</div>
	{#if error}
		<p id="{fieldId}-err" class="text-xs text-danger">{error}</p>
	{/if}
</div>
