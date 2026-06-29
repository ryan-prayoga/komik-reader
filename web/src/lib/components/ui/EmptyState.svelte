<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		icon?: Snippet;
		action?: Snippet;
		class?: string;
	}

	let { title, description, icon, action, class: klass = '' }: Props = $props();
</script>

<div
	class="flex flex-col items-center justify-center gap-3 rounded-[var(--radius)] border border-dashed border-border px-6 py-14 text-center {klass}"
>
	{#if icon}
		<div class="text-muted">{@render icon()}</div>
	{/if}
	<p class="text-base font-medium text-text">{title}</p>
	{#if description}
		<p class="max-w-sm text-sm text-muted">{description}</p>
	{/if}
	{#if action}
		<div class="mt-1">{@render action()}</div>
	{/if}
</div>
