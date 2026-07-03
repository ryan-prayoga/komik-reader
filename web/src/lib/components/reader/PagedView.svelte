<script lang="ts">
	import type { ReaderFit } from '$lib/reader-settings.svelte';

	interface Props {
		pages: string[];
		current?: number;
		double?: boolean;
		fit?: ReaderFit;
		zoom?: number;
		onpage: (index: number) => void;
		ontoggle: () => void;
	}

	let {
		pages,
		current = $bindable(0),
		double = false,
		fit = 'width',
		zoom = 1,
		onpage,
		ontoggle
	}: Props = $props();

	const step = $derived(double ? 2 : 1);
	const lastIndex = $derived(pages.length - 1);

	function next() {
		if (current < lastIndex) {
			current = Math.min(lastIndex, current + step);
			onpage(current);
		}
	}
	function prev() {
		if (current > 0) {
			current = Math.max(0, current - step);
			onpage(current);
		}
	}

	// Keyboard navigation (reader is the focused surface).
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
			e.preventDefault();
			next();
		} else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
			e.preventDefault();
			prev();
		}
	}

	// Touch swipe.
	let touchX = 0;
	function onTouchStart(e: TouchEvent) {
		touchX = e.changedTouches[0]?.clientX ?? 0;
	}
	function onTouchEnd(e: TouchEvent) {
		const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX;
		if (Math.abs(dx) > 50) {
			if (dx < 0) next();
			else prev();
		}
	}

	const visible = $derived(
		double ? [current, current + 1].filter((i) => i <= lastIndex) : [current]
	);
	// Warm the next 1–2 pages.
	const preload = $derived(
		[current + step, current + step + 1].filter((i) => i <= lastIndex).map((i) => pages[i])
	);

	function imgStyle(): string {
		if (fit === 'width') return `width: min(100%, ${56 * zoom}rem)`;
		if (fit === 'height') return `max-height: ${88 * zoom}vh; width: auto`;
		return `transform: scale(${zoom}); transform-origin: center`;
	}
</script>

<svelte:window {onkeydown} />

<div
	class="relative flex min-h-dvh w-full select-none items-center justify-center overflow-auto"
	role="group"
	aria-label="Area baca"
	ontouchstart={onTouchStart}
	ontouchend={onTouchEnd}
>
	<div class="flex items-center justify-center gap-1">
		{#each visible as i (i)}
			<img src={pages[i]} alt="Halaman {i + 1}" class="block object-contain" style={imgStyle()} />
		{/each}
	</div>

	<!-- Tap zones: left = prev, center = toggle chrome, right = next -->
	<div class="absolute inset-0 z-10 flex">
		<button type="button" aria-label="Sebelumnya" class="h-full w-1/3" onclick={prev}></button>
		<button type="button" aria-label="Tampilkan kontrol" class="h-full w-1/3" onclick={ontoggle}></button>
		<button type="button" aria-label="Berikutnya" class="h-full w-1/3" onclick={next}></button>
	</div>

	<!-- Hidden preloads -->
	<div class="hidden">
		{#each preload as url}<img src={url} alt="" />{/each}
	</div>
</div>
