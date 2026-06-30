<script lang="ts">
	import { page } from '$app/stores';
	import { enqueueChapterDownload } from '$lib/graphql/api';
	import { cacheChapterToDevice } from '$lib/offline/cache';
	import Download from '@lucide/svelte/icons/download';
	import HardDriveDownload from '@lucide/svelte/icons/hard-drive-download';
	import Check from '@lucide/svelte/icons/check';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Props {
		chapterId: number;
		isDownloaded?: boolean;
		isOffline?: boolean;
		size?: 'sm' | 'md';
		onqueued?: () => void;
		oncached?: () => void;
		mangaId?: number;
		mangaTitle?: string;
		chapterName?: string;
		thumbnailUrl?: string | null;
		sourceId?: string | null;
	}

	let {
		chapterId,
		isDownloaded = false,
		isOffline = false,
		size = 'sm',
		onqueued,
		oncached,
		mangaId,
		mangaTitle,
		chapterName,
		thumbnailUrl,
		sourceId
	}: Props = $props();

	const guest = $derived(!$page.data.user && $page.data.authEnabled);

	let loading = $state(false);
	let progress = $state(0);
	let error = $state('');
	let cachedNow = $state(false);

	const done = $derived(guest ? (isOffline || cachedNow) : isDownloaded);
	const btnTitle = $derived(
		guest
			? (done ? 'Tersimpan di perangkat' : 'Simpan ke perangkat')
			: (done ? 'Sudah diunduh' : 'Download chapter')
	);

	async function handleClick() {
		if (done) return;
		loading = true;
		error = '';
		try {
			if (guest) {
				if (!mangaId || !mangaTitle || !chapterName) {
					error = 'Info chapter tidak lengkap';
					return;
				}
				progress = 0;
				await cacheChapterToDevice(chapterId, mangaId, mangaTitle, chapterName, (done, total) => {
					progress = Math.round((done / total) * 100);
				}, thumbnailUrl, sourceId);
				cachedNow = true;
				oncached?.();
			} else {
				await enqueueChapterDownload(chapterId);
				onqueued?.();
			}
		} catch (e) {
			error = e instanceof Error ? e.message : (guest ? 'Gagal simpan offline' : 'Gagal antri download');
		} finally {
			loading = false;
		}
	}

	const cls = $derived(size === 'md' ? 'rounded-[var(--radius)] p-2' : 'rounded-md p-1.5');
	const iconSize = $derived(size === 'md' ? 16 : 14);
</script>

{#if done}
	<span class="inline-flex items-center {cls} bg-success/15 text-success" title={btnTitle}>
		<Check size={iconSize} />
	</span>
{:else}
	<button
		class="inline-flex items-center {cls} border border-border bg-surface-hover transition hover:border-accent disabled:opacity-50"
		title={btnTitle}
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
		{:else if guest}
			<HardDriveDownload size={iconSize} />
		{:else}
			<Download size={iconSize} />
		{/if}
	</button>
{/if}
{#if error}
	<span class="text-xs text-danger">{error}</span>
{/if}
