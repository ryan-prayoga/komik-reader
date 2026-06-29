<script lang="ts">
	interface Props {
		pages: string[];
		onpage: (index: number) => void;
		zoom?: number;
		gap?: boolean;
	}
	let { pages, onpage, zoom = 1, gap = true }: Props = $props();

	function observePage(node: HTMLElement, index: number) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) onpage(index);
			},
			{ threshold: 0.5 }
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	const maxWidth = $derived(`${48 * zoom}rem`);
</script>

<div class="mx-auto {gap ? 'space-y-1' : ''}" style="max-width: {maxWidth}">
	{#each pages as pageUrl, i}
		<div class="overflow-hidden" use:observePage={i}>
			<img src={pageUrl} alt="Halaman {i + 1}" class="mx-auto block w-full" loading="lazy" />
		</div>
	{/each}
</div>
