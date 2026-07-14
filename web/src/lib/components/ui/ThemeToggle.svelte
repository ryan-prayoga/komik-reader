<script lang="ts">
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import { preferences } from '$lib/preferences.svelte';

	interface Props {
		class?: string;
	}
	let { class: klass = '' }: Props = $props();

	const isDark = $derived(preferences.resolved === 'dark');
</script>

<button
	type="button"
	onclick={() => preferences.toggleTheme()}
	aria-label={isDark ? 'Mode terang' : 'Mode gelap'}
	title={isDark ? 'Mode terang' : 'Mode gelap'}
	class="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-muted transition hover:bg-surface hover:text-text {klass}"
>
	{#if isDark}
		<Sun size={18} />
	{:else}
		<Moon size={18} />
	{/if}
</button>
