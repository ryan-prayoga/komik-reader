<script lang="ts">
	import { page } from '$app/stores';
	import { setMangaInLibrary } from '$lib/graphql/api';
	import Star from '@lucide/svelte/icons/star';
	import Plus from '@lucide/svelte/icons/plus';
	import LogIn from '@lucide/svelte/icons/log-in';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Props {
		mangaId: number;
		inLibrary?: boolean;
		size?: 'sm' | 'md';
		onchange?: (inLibrary: boolean) => void;
	}

	let { mangaId, inLibrary = false, size = 'md', onchange }: Props = $props();

	const guest = $derived(!$page.data.user && $page.data.authEnabled);
	const loginHref = $derived(`/login?redirectTo=${encodeURIComponent($page.url.pathname)}`);

	let loading = $state(false);
	let optimistic = $state<boolean | null>(null);

	const saved = $derived(optimistic ?? inLibrary);

	const cls = $derived(
		size === 'md'
			? 'gap-2 rounded-[var(--radius)] px-4 py-2 text-sm font-medium'
			: 'gap-1 rounded-md px-2 py-1 text-xs'
	);
	const iconSize = $derived(size === 'md' ? 16 : 13);

	async function toggle() {
		const next = !saved;
		loading = true;
		optimistic = next;
		try {
			const result = await setMangaInLibrary(mangaId, next);
			optimistic = null;
			onchange?.(result.inLibrary);
		} catch {
			optimistic = null;
		} finally {
			loading = false;
		}
	}
</script>

{#if guest}
	<a
		href={loginHref}
		class="inline-flex items-center {cls} border border-border bg-surface-hover transition hover:border-accent"
	>
		<LogIn size={iconSize} /> Library
	</a>
{:else}
	<button
		class="inline-flex items-center {cls} border transition disabled:opacity-50 {saved
			? 'border-accent bg-accent/15 text-accent hover:bg-accent/25'
			: 'border-border bg-surface-hover hover:border-accent'}"
		disabled={loading}
		onclick={toggle}
	>
		{#if loading}
			<Spinner size={iconSize} />
		{:else if saved}
			<Star size={iconSize} fill="currentColor" />
		{:else}
			<Plus size={iconSize} />
		{/if}
		{saved ? 'Di Library' : 'Library'}
	</button>
{/if}
