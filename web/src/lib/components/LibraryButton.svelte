<script lang="ts">
	import { localData } from '$lib/local/data.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import Plus from '@lucide/svelte/icons/plus';

	interface Props {
		mangaId: number;
		title: string;
		thumbnailUrl?: string | null;
		sourceId?: string | null;
		size?: 'sm' | 'md';
		onchange?: (inLibrary: boolean) => void;
	}

	let { mangaId, title, thumbnailUrl = null, sourceId = null, size = 'md', onchange }: Props =
		$props();

	const saved = $derived(localData.isInLibrary(mangaId));

	const cls = $derived(
		size === 'md'
			? 'gap-2 rounded-[var(--radius)] px-4 py-2 text-sm font-medium'
			: 'gap-1 rounded-md px-2 py-1 text-xs'
	);
	const iconSize = $derived(size === 'md' ? 16 : 13);

	async function toggle() {
		const inLibrary = await localData.toggleLibrary({ mangaId, title, thumbnailUrl, sourceId });
		showToast(inLibrary ? 'Ditambahkan ke koleksi.' : 'Dihapus dari koleksi.', 'success');
		onchange?.(inLibrary);
	}
</script>

<button
	type="button"
	class="inline-flex items-center {cls} border transition active:scale-95 {saved
		? 'border-accent bg-accent/15 text-accent hover:bg-accent/25'
		: 'border-border bg-surface-hover hover:border-accent'}"
	onclick={toggle}
>
	{#if saved}
		<Bookmark size={iconSize} fill="currentColor" />
	{:else}
		<Plus size={iconSize} />
	{/if}
	{saved ? 'Di koleksi' : 'Koleksi'}
</button>
