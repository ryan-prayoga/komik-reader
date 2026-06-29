<script lang="ts">
	import { setMangaInLibrary } from '$lib/graphql/api';

	interface Props {
		mangaId: number;
		inLibrary?: boolean;
		size?: 'sm' | 'md';
		onchange?: (inLibrary: boolean) => void;
	}

	let { mangaId, inLibrary = false, size = 'md', onchange }: Props = $props();

	let loading = $state(false);
	let optimistic = $state<boolean | null>(null);

	const saved = $derived(optimistic ?? inLibrary);

	const cls = $derived(
		size === 'md'
			? 'rounded-lg px-4 py-2 text-sm font-medium'
			: 'rounded-md px-2 py-1 text-xs'
	);

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

<button
	class="{cls} border transition disabled:opacity-50 {saved
		? 'border-accent bg-accent/15 text-accent hover:bg-accent/25'
		: 'border-border bg-surface-hover hover:border-accent'}"
	disabled={loading}
	onclick={toggle}
>
	{loading ? '...' : saved ? '★ Di Library' : '+ Library'}
</button>