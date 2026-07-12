<script lang="ts">
	import { onMount } from 'svelte';
	import type { Chapter } from '$lib/graphql/types';
	import { preferences } from '$lib/preferences.svelte';
	import { readerSettings } from '$lib/reader-settings.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	type Section = { chapter: Chapter; pages: string[] };

	interface Props {
		sections: Section[];
		onpage: (
			chapterId: number,
			pageIdx: number,
			pageProgress: number,
			chapterProgress: number
		) => void;
		onnearend?: () => void;
		onzoom?: (zoom: number) => void;
		zoom?: number;
		gap?: boolean;
		initialPage?: number;
		// Bumped by the parent on every hard chapter navigation (URL change), as
		// opposed to infinite-scroll appends which leave this untouched. Lets us
		// tell "user jumped chapters" apart from "next chapter streamed in".
		resetToken?: number | string;
		// Re-fetch a chapter's page URLs from the server. Suwayomi page URLs can go
		// stale, so retrying the same URL forever never recovers — after repeated
		// failures the retry button escalates to this instead.
		onrefreshpages?: (chapterId: number) => Promise<void>;
	}

	let {
		sections,
		onpage,
		onnearend,
		onzoom,
		zoom = 1,
		gap = true,
		initialPage = 0,
		resetToken,
		onrefreshpages
	}: Props = $props();

	// Pinch-to-zoom (same model as PagedView — parent owns persisted zoom).
	let pinchStartDist = 0;
	let pinchStartZoom = 1;

	function pinchDist(e: TouchEvent): number {
		const [a, b] = [e.touches[0], e.touches[1]];
		return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
	}

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			pinchStartDist = pinchDist(e);
			pinchStartZoom = zoom;
		}
	}
	function onTouchMove(e: TouchEvent) {
		if (e.touches.length === 2 && pinchStartDist > 0 && onzoom) {
			e.preventDefault();
			const ratio = pinchDist(e) / pinchStartDist;
			const z = Math.min(2, Math.max(0.5, +(pinchStartZoom * ratio).toFixed(2)));
			onzoom(z);
		}
	}
	function onTouchEnd() {
		pinchStartDist = 0;
	}

	// Keyed by chapter id (not array index) so entries stay valid when `sections`
	// is pruned from the front — an index-based key would silently go stale and
	// point at the wrong chapter once earlier sections are dropped.
	const pageEls = new Map<string, HTMLElement>();
	let activeChapterId = 0;
	let activePi = 0;

	let loadedPages = $state<Record<string, boolean>>({});
	let errorPages = $state<Record<string, boolean>>({});
	let retryCounts = $state<Record<string, number>>({});
	// Pages the preload observer has pulled into range — flipped to eager fetch a
	// few screens before they scroll into view so the reader never shows a black
	// placeholder void mid-scroll (native lazy loads too late on slow mobile links).
	let eagerPages = $state<Record<string, boolean>>({});

	// Per-chapter real page ratio (height/width), learned from images as they
	// load. Webtoon sources slice a chapter into uniform pieces, so the median
	// of the loaded pages predicts the unloaded ones far better than the fixed
	// 2:3 guess — a smaller placeholder error means smaller layout shifts (and
	// smaller anchoring corrections) when late images stream in.
	const chapterRatioSamples = new Map<number, number[]>();
	let chapterRatioGuess = $state<Record<number, number>>({});
	function noteRatio(chapterId: number, img: HTMLImageElement) {
		if (!img.naturalWidth || !img.naturalHeight) return;
		const samples = chapterRatioSamples.get(chapterId) ?? [];
		samples.push(img.naturalHeight / img.naturalWidth);
		chapterRatioSamples.set(chapterId, samples);
		const sorted = [...samples].sort((a, b) => a - b);
		chapterRatioGuess[chapterId] = sorted[Math.floor(sorted.length / 2)];
	}

	function markLoaded(key: string, chapterId: number, img: HTMLImageElement) {
		noteRatio(chapterId, img);
		loadedPages[key] = true;
		errorPages[key] = false;
	}
	function markError(key: string) {
		errorPages[key] = true;
	}
	// Chapters whose page URLs are being re-fetched — guards double taps while the
	// refresh request is in flight.
	const refreshingChapters = new Set<number>();
	function clearChapterLoadState(chapterId: number) {
		for (const rec of [loadedPages, errorPages, retryCounts]) {
			for (const k of Object.keys(rec)) {
				if (k.startsWith(`${chapterId}-`)) delete rec[k];
			}
		}
	}
	async function retryPage(key: string, chapterId: number) {
		const attempts = (retryCounts[key] ?? 0) + 1;
		errorPages[key] = false;
		loadedPages[key] = false;
		retryCounts[key] = attempts;
		// Same-URL retries only help for transient hiccups; after two failures the
		// URL itself is likely stale — ask the parent for fresh ones instead.
		if (attempts >= 2 && onrefreshpages && !refreshingChapters.has(chapterId)) {
			refreshingChapters.add(chapterId);
			try {
				await onrefreshpages(chapterId);
				clearChapterLoadState(chapterId);
			} catch {
				markError(key);
			} finally {
				refreshingChapters.delete(chapterId);
			}
		}
	}

	// Hard chapter nav (URL change) must drop the old chapter's tracking state
	// (activeChapterId/activePi), or a stale scroll tick reports the chapter
	// just left and snaps the parent's currentChapterId/header/URL back to it —
	// the flicker/crash-out-of-reader bug. But this reset must ONLY run on an
	// actual token change: on first mount this $effect fires AFTER the
	// use:observePage actions have already registered every page, so an
	// unconditional pageEls.clear() here wiped the map right after it was
	// built — progress/resume were dead for the whole first chapter (entries
	// only ever re-register when NEW pages mount). pageEls is intentionally
	// left alone even on a real change: observePage's destroy() already
	// removes exactly the entries whose pages unmount, and clearing here
	// races the new chapter's actions registering into the same map.
	// svelte-ignore state_referenced_locally -- capturing the initial value is the point
	let appliedResetToken = resetToken;
	$effect(() => {
		if (resetToken === appliedResetToken) return;
		appliedResetToken = resetToken;
		activeChapterId = 0;
		activePi = 0;
		loadedPages = {};
		errorPages = {};
		retryCounts = {};
		eagerPages = {};
		// A correction computed against the old chapter's layout must not land
		// on the freshly-reset scroll position.
		pendingAnchorDelta = 0;
	});
	function pageSrc(url: string, key: string): string {
		const n = retryCounts[key];
		if (!n) return url;
		return `${url}${url.includes('?') ? '&' : '?'}_retry=${n}`;
	}

	// ── Manual scroll anchoring ─────────────────────────────────────────────
	// iOS Safari has no native scroll anchoring at all (overflow-anchor is
	// Chrome/Firefox only), so when a page ABOVE the viewport swaps its guessed
	// placeholder height for the real image height, everything below shifts and
	// the reading position jumps — the "suddenly mid-chapter after crossing
	// into the next chapter" reports. Replicate anchoring by hand: a
	// ResizeObserver callback runs after layout but BEFORE paint, so shifting
	// scrollTop by the height delta inside it lands in the same frame as the
	// resize and is never visible. Native anchoring is disabled on the scroll
	// container (overflow-anchor: none, app.css) so Chrome doesn't stack its
	// own correction on top of this one.
	const pageHeights = new Map<string, number>();
	let pendingAnchorDelta = 0;
	let anchorRafId = 0;
	let anchorRetries = 0;

	function scrollerEl(): HTMLElement | null {
		return (rootEl?.closest('[data-reader-scroll]') as HTMLElement | null) ?? null;
	}

	// iOS also ignores programmatic scrollTop writes while a momentum fling is
	// in flight — keep reapplying the outstanding delta each frame until the
	// scroller actually takes it, unless it would push past a scroll bound.
	function applyAnchorDelta() {
		cancelAnimationFrame(anchorRafId);
		const scroller = scrollerEl();
		if (!scroller || !pendingAnchorDelta) return;
		const before = scroller.scrollTop;
		scroller.scrollTop = before + pendingAnchorDelta;
		const applied = scroller.scrollTop - before;
		pendingAnchorDelta -= applied;
		if (Math.abs(pendingAnchorDelta) < 0.5) {
			pendingAnchorDelta = 0;
			return;
		}
		const max = scroller.scrollHeight - scroller.clientHeight;
		const atBound =
			(pendingAnchorDelta > 0 && before >= max - 1) || (pendingAnchorDelta < 0 && before <= 1);
		if (atBound || ++anchorRetries > 180) {
			pendingAnchorDelta = 0;
			return;
		}
		anchorRafId = requestAnimationFrame(applyAnchorDelta);
	}

	const resizeAnchor =
		typeof ResizeObserver !== 'undefined'
			? new ResizeObserver((entries) => {
					const scrollerTop = scrollerEl()?.getBoundingClientRect().top ?? 0;
					let delta = 0;
					for (const entry of entries) {
						const el = entry.target as HTMLElement;
						const key = el.dataset.pageKey;
						if (!key) continue;
						const newH = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
						const oldH = pageHeights.get(key);
						pageHeights.set(key, newH);
						if (oldH === undefined || Math.abs(newH - oldH) < 0.5) continue;
						// Only pages fully above the viewport shift the reading position —
						// a page in view grows downward from its own (stable) top edge.
						if (el.getBoundingClientRect().bottom <= scrollerTop + 1) delta += newH - oldH;
					}
					if (delta) {
						pendingAnchorDelta += delta;
						anchorRetries = 0;
						applyAnchorDelta();
					}
				})
			: null;

	// Derive the active page from live geometry instead of trusting the last
	// IntersectionObserver callback. Fast (momentum) scrolling coalesces IO
	// events — pages that enter AND leave the activation band between two
	// observation frames never fire at all, including a chapter's LAST page.
	// Progress then sticks at a stale mid-chapter position and isRead never
	// latches, which is how finished chapters kept reopening at their "end".
	// The active page is the deepest one whose top has crossed the activation
	// line (top 40% of the viewport — same semantics as the IO rootMargin),
	// with one extra rule: once the chapter's last page is fully scrolled in
	// (its bottom within the viewport), the last page IS the active page even
	// if a short page can never reach the 40% line at max scroll.
	function geometricActivePage(): { chapterId: number; pi: number } | null {
		const line = window.innerHeight * 0.4;
		let best: { chapterId: number; pi: number; top: number } | null = null;
		for (const section of sections) {
			for (let pi = 0; pi < section.pages.length; pi++) {
				const el = pageEls.get(`${section.chapter.id}-${pi}`);
				if (!el) continue;
				const top = el.getBoundingClientRect().top;
				if (top <= line && (!best || top > best.top)) {
					best = { chapterId: section.chapter.id, pi, top };
				}
			}
		}
		if (!best) return null;
		const section = sections.find((s) => s.chapter.id === best.chapterId);
		if (section) {
			const lastIdx = section.pages.length - 1;
			const lastEl = pageEls.get(`${best.chapterId}-${lastIdx}`);
			if (lastEl && lastEl.getBoundingClientRect().bottom <= window.innerHeight + 1) {
				return { chapterId: best.chapterId, pi: lastIdx };
			}
		}
		return { chapterId: best.chapterId, pi: best.pi };
	}

	function reportCurrentProgress() {
		// 0 is the "not tracking anything yet" sentinel (see the resetToken
		// effect) — right after a hard chapter switch, before the new chapter's
		// first page has intersected, a stray scroll tick must not report this
		// up as real progress or it clobbers the parent's just-set chapter id.
		if (!activeChapterId) return;
		const geo = geometricActivePage();
		if (geo) {
			activeChapterId = geo.chapterId;
			activePi = geo.pi;
		}
		const el = pageEls.get(`${activeChapterId}-${activePi}`);
		if (!el) {
			onpage(activeChapterId, activePi, 0, 0);
			return;
		}
		const { top, height } = el.getBoundingClientRect();
		// progress 0 = top of page at viewport top, 1 = bottom of page at viewport top
		const progress = height > 0 ? Math.max(0, Math.min(1, -top / height)) : 0;
		onpage(activeChapterId, activePi, progress, chapterScrollProgress(activeChapterId));
	}

	// True scroll-extent progress for the active chapter: 0 at the chapter's first
	// page top, 1 once scrolled all the way to its last page bottom. Unlike per-page
	// progress, this isn't bounded by individual page heights, so it actually reaches
	// 0/1 at the real start/end instead of stalling short on short pages.
	function chapterScrollProgress(chapterId: number): number {
		const section = sections.find((s) => s.chapter.id === chapterId);
		const lastIdx = (section?.pages.length ?? 1) - 1;
		const firstEl = pageEls.get(`${chapterId}-0`);
		const lastEl = pageEls.get(`${chapterId}-${lastIdx}`);
		if (!firstEl || !lastEl) return 0;
		const firstTop = firstEl.getBoundingClientRect().top;
		const lastBottom = lastEl.getBoundingClientRect().bottom;
		const scrollable = lastBottom - firstTop - window.innerHeight;
		if (scrollable <= 0) return firstTop <= 0 ? 1 : 0;
		return Math.max(0, Math.min(1, -firstTop / scrollable));
	}

	function observePage(node: HTMLElement, param: { chapterId: number; pi: number }) {
		const key = `${param.chapterId}-${param.pi}`;
		pageEls.set(key, node);
		pageHeights.set(key, node.offsetHeight);
		resizeAnchor?.observe(node);

		const root = node.closest('[data-reader-scroll]');
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					activeChapterId = param.chapterId;
					activePi = param.pi;
					reportCurrentProgress();
				}
			},
			// root must be the reader's own scroll container when there is one:
			// with the implicit viewport root, content clipped by that container
			// never counts as intersecting and rootMargin stops working.
			{ threshold: 0, rootMargin: '0px 0px -60% 0px', root }
		);
		observer.observe(node);

		// Preload observer: taller margin (or short when data-saver) flips the page to
		// an eager fetch before viewport. One-shot — disconnects once armed.
		const margin = preferences.dataSaver ? '400px 0px 400px 0px' : '2500px 0px 2500px 0px';
		const preloader = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					eagerPages[key] = true;
					preloader.disconnect();
				}
			},
			{ threshold: 0, rootMargin: margin, root }
		);
		preloader.observe(node);

		return {
			destroy() {
				observer.disconnect();
				preloader.disconnect();
				resizeAnchor?.unobserve(node);
				pageHeights.delete(key);
				pageEls.delete(key);
			}
		};
	}

	function observeSentinel(node: HTMLElement) {
		// Trigger a full viewport height before the true bottom so slow chapter
		// fetches finish before the user actually scrolls past the last page.
		const margin = Math.max(800, typeof window !== 'undefined' ? window.innerHeight : 0);
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) onnearend?.();
			},
			// Same as observePage: rootMargin below the fold only works if root is
			// the actual scroll container, not the implicit viewport.
			{
				rootMargin: `0px 0px ${margin}px 0px`,
				threshold: 0,
				root: node.closest('[data-reader-scroll]')
			}
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	let rootEl: HTMLElement;

	onMount(() => {
		let scrollRafId: number;
		let retryTimers: ReturnType<typeof setTimeout>[] = [];

		if (initialPage > 0) {
			function scrollToTarget() {
				const firstChapterId = sections[0]?.chapter.id;
				pageEls
					.get(`${firstChapterId}-${initialPage}`)
					?.scrollIntoView({ block: 'start', behavior: 'instant' });
			}
			// Retry a few times as images above the target finish loading and establish
			// height. The last retry is intentionally generous — a slow device/network
			// (or the offline cache path, which serves pages already-downloaded but
			// still decoded on-device) can take well over a second to lay out enough
			// pages to make the target page's offset reachable.
			scrollRafId = requestAnimationFrame(scrollToTarget);
			retryTimers.push(setTimeout(scrollToTarget, 400));
			retryTimers.push(setTimeout(scrollToTarget, 1200));
			retryTimers.push(setTimeout(scrollToTarget, 3000));
		}

		let rafId: number;
		function onScroll() {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(reportCurrentProgress);
		}

		// Scroll happens on the reader's own container when one wraps us (element
		// scroll events don't bubble to window), otherwise on the document.
		const scroller: HTMLElement | Window = rootEl?.closest('[data-reader-scroll]') ?? window;
		scroller.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			scroller.removeEventListener('scroll', onScroll);
			cancelAnimationFrame(rafId);
			cancelAnimationFrame(scrollRafId);
			cancelAnimationFrame(anchorRafId);
			retryTimers.forEach(clearTimeout);
			resizeAnchor?.disconnect();
		};
	});

	const maxWidth = $derived(`${48 * zoom * (readerSettings.cropBorders ? 1.03 : 1)}rem`);
</script>

<!-- Layout stability when a placeholder swaps to its real image height is
     handled by the manual ResizeObserver anchoring in the script above — NOT
     by native scroll anchoring, which iOS Safari doesn't implement at all
     (the earlier native-anchoring fix only ever worked on Chrome/Firefox;
     iPhones kept jumping mid-chapter). An onload-driven compensation can't
     work either — the resize happens synchronously inside the img's own
     layout resolution, ahead of any 'load' handler — but ResizeObserver
     callbacks run post-layout and PRE-PAINT, so the scrollTop correction
     lands in the same frame as the resize on every engine. Native anchoring
     is explicitly disabled on the scroll container (app.css) so Chrome
     doesn't apply a second correction on top. -->
<div
	bind:this={rootEl}
	class="mx-auto touch-pan-y {gap ? 'space-y-1' : ''}"
	style="max-width: {maxWidth};"
	ontouchstart={onTouchStart}
	ontouchmove={onTouchMove}
	ontouchend={onTouchEnd}
>
	{#each sections as section, si (section.chapter.id)}
		{#if si > 0}
			<div class="flex items-center gap-3 px-4 py-8">
				<div class="h-px flex-1 bg-white/15"></div>
				<span class="rounded-full bg-white/10 px-3 py-1 text-xs text-white/60"
					>{section.chapter.name}</span
				>
				<div class="h-px flex-1 bg-white/15"></div>
			</div>
		{/if}
		{#each section.pages as pageUrl, pi (pi)}
			{@const key = `${section.chapter.id}-${pi}`}
			{@const ratio = chapterRatioGuess[section.chapter.id] ?? 1.5}
			<!-- Placeholder ratio lives on the CONTAINER, not just the img: a broken
			     image collapses to near-zero height in most browsers (aspect-ratio
			     only reliably applies while the image has layout), and with
			     overflow-hidden that clipped the retry overlay into an untappable
			     sliver. -->
			<div
				class="relative overflow-hidden"
				style={loadedPages[key] ? '' : `aspect-ratio: 1 / ${ratio}`}
				data-page-key={key}
				use:observePage={{ chapterId: section.chapter.id, pi }}
			>
				{#if errorPages[key]}
					<div
						class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/[0.03]"
					>
						{#if retryCounts[key]}
							<p class="text-xs text-white/50">Gagal dimuat ({retryCounts[key]}×)</p>
						{/if}
						<button
							type="button"
							class="min-h-11 rounded-full bg-white/10 px-5 py-2.5 text-sm text-white/80 hover:bg-white/20"
							onpointerdown={(e) => e.stopPropagation()}
							onclick={(e) => {
								e.stopPropagation();
								void retryPage(key, section.chapter.id);
							}}
						>
							Muat ulang
						</button>
					</div>
				{:else if !loadedPages[key]}
					<div class="absolute inset-0 flex items-center justify-center bg-white/[0.03]">
						<Spinner size={24} class="text-white/40" />
					</div>
				{/if}
				<img
					src={pageSrc(pageUrl, key)}
					alt="Halaman {pi + 1}"
					class="mx-auto block w-full transition-opacity duration-300 {loadedPages[key]
						? 'opacity-100'
						: 'opacity-0'} {readerSettings.cropBorders ? 'scale-[1.03]' : ''}"
					style="aspect-ratio: auto 1 / {ratio}"
					loading={eagerPages[key] || (si === 0 && pi <= initialPage) ? 'eager' : 'lazy'}
					decoding="async"
					onload={(e) => markLoaded(key, section.chapter.id, e.currentTarget as HTMLImageElement)}
					onerror={() => markError(key)}
				/>
			</div>
		{/each}
	{/each}
	<div use:observeSentinel class="h-px"></div>
</div>
