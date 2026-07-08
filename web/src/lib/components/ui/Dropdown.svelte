<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { motionDuration } from '$lib/utils/motion';

	interface Props {
		trigger: Snippet<[{ open: boolean; toggle: () => void }]>;
		children: Snippet<[{ close: () => void }]>;
		align?: 'left' | 'right';
		class?: string;
	}

	let { trigger, children, align = 'right', class: klass = '' }: Props = $props();

	let open = $state(false);
	let root: HTMLElement;

	function toggle() {
		open = !open;
	}
	function close() {
		open = false;
	}
	function onwindowclick(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) close();
	}
	function onwindowkeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') {
			close();
			// Return focus to the trigger so keyboard users aren't stranded.
			root?.querySelector<HTMLElement>('button, a, [tabindex]')?.focus();
		}
	}
</script>

<svelte:window onclick={onwindowclick} onkeydown={onwindowkeydown} />

<div bind:this={root} class="relative {klass}">
	{@render trigger({ open, toggle })}
	{#if open}
		<div
			transition:fade={{ duration: motionDuration(120) }}
			class="absolute z-50 mt-2 min-w-44 overflow-hidden rounded-[var(--radius)] border border-border bg-surface p-1 shadow-(--shadow-pop) {align ===
			'right'
				? 'right-0'
				: 'left-0'}"
			role="menu"
		>
			{@render children({ close })}
		</div>
	{/if}
</div>
