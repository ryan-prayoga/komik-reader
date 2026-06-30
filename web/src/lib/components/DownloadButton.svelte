<script lang="ts">
	import { enqueueChapterDownload } from '$lib/graphql/api';
	import Download from '@lucide/svelte/icons/download';
	import Check from '@lucide/svelte/icons/check';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Props {
		chapterId: number;
		isDownloaded?: boolean;
		size?: 'sm' | 'md';
		onqueued?: () => void;
	}

	let { chapterId, isDownloaded = false, size = 'sm', onqueued }: Props = $props();

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
			? 'rounded-[var(--radius)] p-2'
			: 'rounded-md p-1.5'
	);
	const iconSize = $derived(size === 'md' ? 16 : 14);
</script>

{#if isDownloaded}
	<span class="inline-flex items-center {cls} bg-success/15 text-success" title="Sudah diunduh">
		<Check size={iconSize} />
	</span>
{:else}
	<button
		class="inline-flex items-center {cls} border border-border bg-surface-hover transition hover:border-accent disabled:opacity-50"
		title="Download chapter"
		disabled={loading}
		onclick={(e) => {
			e.preventDefault();
			e.stopPropagation();
			download();
		}}
	>
		{#if loading}<Spinner size={iconSize} />{:else}<Download size={iconSize} />{/if}
	</button>
{/if}
{#if error}
	<span class="text-xs text-danger">{error}</span>
{/if}
