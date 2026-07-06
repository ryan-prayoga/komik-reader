<script lang="ts">
	import type { ReaderFit, ReaderDirection } from '$lib/reader-settings.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Props {
		pages: string[];
		current?: number;
		double?: boolean;
		doubleOffset?: boolean;
		fit?: ReaderFit;
		zoom?: number;
		direction?: ReaderDirection;
		onpage: (index: number) => void;
		ontoggle: () => void;
		onnext?: () => void; // advance past the last page (→ next chapter)
		onprev?: () => void; // go back before the first page (→ prev chapter)
		onzoom?: (zoom: number) => void; // pinch-to-zoom
	}

	let {
		pages,
		current = $bindable(0),
		double = false,
		doubleOffset = false,
		fit = 'width',
		zoom = 1,
		direction = 'ltr',
		onpage,
		ontoggle,
		onnext,
		onprev,
		onzoom
	}: Props = $props();

	const lastIndex = $derived(pages.length - 1);

	let loadedPages = $state<Record<number, boolean>>({});
	let errorPages = $state<Record<number, boolean>>({});
	let retryCounts = $state<Record<number, number>>({});
	function markLoaded(i: number) {
		loadedPages[i] = true;
		errorPages[i] = false;
	}
	function markError(i: number) {
		errorPages[i] = true;
	}
	function retryPage(i: number) {
		errorPages[i] = false;
		loadedPages[i] = false;
		retryCounts[i] = (retryCounts[i] ?? 0) + 1;
	}

	// `pages` is index-keyed and this component never unmounts across a chapter
	// change, so without a reset here the new chapter's page 0 briefly renders
	// with the OLD page 0's loaded/opacity state (a flash of the wrong or blank
	// image) before its own onload fires — the reported flicker.
	$effect(() => {
		pages;
		loadedPages = {};
		errorPages = {};
		retryCounts = {};
		navigatingAway = false;
	});

	// Guards against next()/prev() firing twice past the boundary before the
	// chapter-change navigation actually lands (e.g. a fast double-tap on the
	// last page) — a second goto() to the same target mid-navigation could
	// race SvelteKit's router and knock the whole reader out to an error page.
	let navigatingAway = $state(false);
	function pageSrc(i: number): string {
		const url = pages[i];
		const n = retryCounts[i];
		if (!n) return url;
		return `${url}${url.includes('?') ? '&' : '?'}_retry=${n}`;
	}

	// Left page index of the pair that contains `i`. In offset double mode the
	// very first page stands alone so subsequent spreads line up.
	function pairStart(i: number): number {
		if (!double) return i;
		if (doubleOffset) {
			if (i <= 0) return 0;
			return i - ((i - 1) % 2);
		}
		return i - (i % 2);
	}

	function nextIndex(i: number): number {
		if (!double) return i + 1;
		const start = pairStart(i);
		if (doubleOffset && start === 0) return 1;
		return start + 2;
	}

	function next() {
		const n = nextIndex(current);
		if (n > lastIndex) {
			if (navigatingAway) return; // already handing off — don't double-navigate
			navigatingAway = true;
			onnext?.(); // past the end — hand off to chapter navigation
			return;
		}
		current = n;
		onpage(current);
	}
	function prev() {
		if (current <= 0) {
			if (navigatingAway) return;
			navigatingAway = true;
			onprev?.();
			return;
		}
		current = pairStart(current - 1);
		onpage(current);
	}

	// Keyboard navigation (reader is the focused surface). ArrowRight advances in
	// the reading direction — flipped for RTL (manga).
	function onkeydown(e: KeyboardEvent) {
		const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
		const back = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
		if (e.key === forward || e.key === ' ' || e.key === 'PageDown') {
			e.preventDefault();
			next();
		} else if (e.key === back || e.key === 'PageUp') {
			e.preventDefault();
			prev();
		}
	}

	// Touch: swipe to page, pinch to zoom.
	let touchX = 0;
	let pinchStartDist = 0;
	let pinchStartZoom = 1;

	function dist(e: TouchEvent): number {
		const [a, b] = [e.touches[0], e.touches[1]];
		return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
	}

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			pinchStartDist = dist(e);
			pinchStartZoom = zoom;
		} else {
			touchX = e.changedTouches[0]?.clientX ?? 0;
		}
	}
	function onTouchMove(e: TouchEvent) {
		if (e.touches.length === 2 && pinchStartDist > 0) {
			e.preventDefault();
			const ratio = dist(e) / pinchStartDist;
			const z = Math.min(2, Math.max(0.5, +(pinchStartZoom * ratio).toFixed(2)));
			onzoom?.(z);
		}
	}
	function onTouchEnd(e: TouchEvent) {
		if (pinchStartDist > 0) {
			pinchStartDist = 0;
			return; // finishing a pinch, not a swipe
		}
		const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX;
		if (Math.abs(dx) > 50) {
			// swipe left = forward for LTR, backward for RTL
			const forward = direction === 'rtl' ? dx > 0 : dx < 0;
			if (forward) next();
			else prev();
		}
	}

	// Pages currently on screen. In double mode that's the pair; RTL flips their
	// visual order so page N sits on the right.
	const visible = $derived.by(() => {
		const start = pairStart(current);
		let list: number[];
		if (!double || (doubleOffset && start === 0)) list = [start];
		else list = [start, start + 1].filter((i) => i <= lastIndex);
		return direction === 'rtl' ? [...list].reverse() : list;
	});
	// Warm the next pair.
	const preload = $derived(
		[nextIndex(current), nextIndex(current) + 1].filter((i) => i <= lastIndex).map((i) => pages[i])
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
	ontouchmove={onTouchMove}
	ontouchend={onTouchEnd}
>
	<div class="flex items-center justify-center gap-1">
		{#each visible as i (i)}
			<div
				class="relative flex items-center justify-center {loadedPages[i]
					? ''
					: 'min-h-[50vh] min-w-[40vw]'}"
			>
				{#if errorPages[i]}
					<div class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2">
						<button
							type="button"
							class="rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20"
							onclick={() => retryPage(i)}
						>
							Muat ulang
						</button>
					</div>
				{:else if !loadedPages[i]}
					<div class="absolute inset-0 flex items-center justify-center">
						<Spinner size={28} class="text-white/40" />
					</div>
				{/if}
				<img
					src={pageSrc(i)}
					alt="Halaman {i + 1}"
					class="block object-contain transition-opacity duration-300 {loadedPages[i]
						? 'opacity-100'
						: 'opacity-0'}"
					style={imgStyle()}
					decoding="async"
					onload={() => markLoaded(i)}
					onerror={() => markError(i)}
				/>
			</div>
		{/each}
	</div>

	<!-- Tap zones: outer thirds page in the reading direction, center toggles chrome. -->
	<div class="absolute inset-0 z-10 flex">
		<button
			type="button"
			aria-label={direction === 'rtl' ? 'Berikutnya' : 'Sebelumnya'}
			class="h-full w-1/3"
			onclick={direction === 'rtl' ? next : prev}
		></button>
		<button type="button" aria-label="Tampilkan kontrol" class="h-full w-1/3" onclick={ontoggle}></button>
		<button
			type="button"
			aria-label={direction === 'rtl' ? 'Sebelumnya' : 'Berikutnya'}
			class="h-full w-1/3"
			onclick={direction === 'rtl' ? prev : next}
		></button>
	</div>

	<!-- Hidden preloads -->
	<div class="hidden">
		{#each preload as url}<img src={url} alt="" />{/each}
	</div>
</div>
