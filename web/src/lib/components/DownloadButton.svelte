<script lang="ts">
	import { page } from '$app/stores';
	import { enqueueChapterDownload } from '$lib/graphql/api';
	import Download from '@lucide/svelte/icons/download';
	import Check from '@lucide/svelte/icons/check';
	import LogIn from '@lucide/svelte/icons/log-in';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Props {
		chapterId: number;
		isDownloaded?: boolean;
		size?: 'sm' | 'md';
		onqueued?: () => void;
	}

	let { chapterId, isDownloaded = false, size = 'sm', onqueued }: Props = $props();

	const guest = $derived(!$page.data.user && $page.data.authEnabled);
	const loginHref = $derived(`/login?redirectTo=${encodeURIComponent($page.url.pathname)}`);

	let loading = $state(false);
	let error = $state('');

	async function download() {
		if (isDownloaded) return;
		loading = true;
		error = '';
		try {
			await enqueueChapterDownload(chapterId);
			onqueued?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal antri download';
		} finally {
			loading = false;
		}
	}

	const cls = $derived(
		size === 'md'
			? 'gap-2 rounded-[var(--radius)] px-4 py-2 text-sm font-medium'
			: 'gap-1 rounded-md px-2 py-1 text-xs'
	);
	const iconSize = $derived(size === 'md' ? 16 : 13);
</script>

{#if isDownloaded}
	<span class="inline-flex items-center {cls} bg-success/15 text-success">
		<Check size={iconSize} /> Downloaded
	</span>
{:else if guest}
	<a
		href={loginHref}
		class="inline-flex items-center {cls} border border-border bg-surface-hover transition hover:border-accent"
		onclick={(e) => e.stopPropagation()}
	>
		<LogIn size={iconSize} /> Download
	</a>
{:else}
	<button
		class="inline-flex items-center {cls} border border-border bg-surface-hover transition hover:border-accent disabled:opacity-50"
		disabled={loading}
		onclick={(e) => {
			e.preventDefault();
			e.stopPropagation();
			download();
		}}
	>
		{#if loading}<Spinner size={iconSize} />{:else}<Download size={iconSize} />{/if}
		Download
	</button>
{/if}
{#if error}
	<span class="text-xs text-danger">{error}</span>
{/if}
