<script lang="ts">
	import { cacheChapterToDevice } from '$lib/offline/cache';
	import Download from '@lucide/svelte/icons/download';
	import Check from '@lucide/svelte/icons/check';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Props {
		chapterId: number;
		isOffline?: boolean;
		size?: 'sm' | 'md';
		oncached?: () => void;
		mangaId?: number;
		mangaTitle?: string;
		chapterName?: string;
		thumbnailUrl?: string | null;
		sourceId?: string | null;
	}

	let {
		chapterId,
		isOffline = false,
		size = 'sm',
		oncached,
		mangaId,
		mangaTitle,
		chapterName,
		thumbnailUrl,
		sourceId
	}: Props = $props();

	let loading = $state(false);
	let progress = $state(0);
	let error = $state('');
	let cachedNow = $state(false);

	const done = $derived(isOffline || cachedNow);

	async function handleClick() {
		if (done) return;
		if (!mangaId || !mangaTitle || !chapterName) {
			error = 'Info chapter tidak lengkap';
			return;
		}
		loading = true;
		error = '';
		progress = 0;
		try {
			await cacheChapterToDevice(
				chapterId,
				mangaId,
				mangaTitle,
				chapterName,
				(d, total) => {
					progress = Math.round((d / total) * 100);
				},
				thumbnailUrl,
				sourceId
			);
			cachedNow = true;
			oncached?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal simpan offline';
		} finally {
			loading = false;
		}
	}

	const cls = $derived(size === 'md' ? 'rounded-[var(--radius)] p-2' : 'rounded-md p-1.5');
	const iconSize = $derived(size === 'md' ? 16 : 14);
</script>

{#if done}
	<span class="inline-flex items-center {cls} bg-success/15 text-success" title="Tersimpan di perangkat">
		<Check size={iconSize} />
	</span>
{:else}
	<button
		class="inline-flex items-center {cls} border border-border bg-surface-hover transition hover:border-accent disabled:opacity-50"
		title="Simpan offline"
		disabled={loading}
		onclick={(e) => {
			e.preventDefault();
			e.stopPropagation();
			handleClick();
		}}
	>
		{#if loading && progress > 0}
			<span class="text-[10px] font-medium leading-none tabular-nums">{progress}%</span>
		{:else if loading}
			<Spinner size={iconSize} />
		{:else}
			<Download size={iconSize} />
		{/if}
	</button>
{/if}
{#if error}
	<span class="text-xs text-danger">{error}</span>
{/if}
