<script lang="ts">
	import { enqueueChapterDownload } from '$lib/graphql/api';

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
			? 'rounded-lg px-4 py-2 text-sm font-medium'
			: 'rounded-md px-2 py-1 text-xs'
	);
</script>

{#if isDownloaded}
	<span class="{cls} bg-success/15 text-success">Downloaded</span>
{:else}
	<button
		class="{cls} border border-border bg-surface-hover transition hover:border-accent disabled:opacity-50"
		disabled={loading}
		onclick={(e) => {
			e.preventDefault();
			e.stopPropagation();
			download();
		}}
	>
		{loading ? '...' : 'Download'}
	</button>
{/if}
{#if error}
	<span class="text-xs text-danger">{error}</span>
{/if}