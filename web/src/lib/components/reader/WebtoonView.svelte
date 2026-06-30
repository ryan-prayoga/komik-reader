<script lang="ts">
	import { onMount } from 'svelte';
	import type { Chapter } from '$lib/graphql/types';

	type Section = { chapter: Chapter; pages: string[] };

	interface Props {
		sections: Section[];
		onpage: (
			sectionIdx: number,
			pageIdx: number,
			pageProgress: number,
			chapterProgress: number
		) => void;
		onnearend?: () => void;
		zoom?: number;
		gap?: boolean;
		initialPage?: number;
	}

	let { sections, onpage, onnearend, zoom = 1, gap = true, initialPage = 0 }: Props = $props();

	// Track current page element for scroll-based progress
	const pageEls = new Map<string, HTMLElement>();
	let activeSi = 0;
	let activePi = 0;

	function reportCurrentProgress() {
		const el = pageEls.get(`${activeSi}-${activePi}`);
		if (!el) {
			onpage(activeSi, activePi, 0, 0);
			return;
		}
		const { top, height } = el.getBoundingClientRect();
		// progress 0 = top of page at viewport top, 1 = bottom of page at viewport top
		const progress = height > 0 ? Math.max(0, Math.min(1, -top / height)) : 0;
		onpage(activeSi, activePi, progress, chapterScrollProgress(activeSi));
	}

	// True scroll-extent progress for the active chapter: 0 at the chapter's first
	// page top, 1 once scrolled all the way to its last page bottom. Unlike per-page
	// progress, this isn't bounded by individual page heights, so it actually reaches
	// 0/1 at the real start/end instead of stalling short on short pages.
	function chapterScrollProgress(si: number): number {
		const lastIdx = (sections[si]?.pages.length ?? 1) - 1;
		const firstEl = pageEls.get(`${si}-0`);
		const lastEl = pageEls.get(`${si}-${lastIdx}`);
		if (!firstEl || !lastEl) return 0;
		const firstTop = firstEl.getBoundingClientRect().top;
		const lastBottom = lastEl.getBoundingClientRect().bottom;
		const scrollable = lastBottom - firstTop - window.innerHeight;
		if (scrollable <= 0) return firstTop <= 0 ? 1 : 0;
		return Math.max(0, Math.min(1, -firstTop / scrollable));
	}

	function observePage(node: HTMLElement, param: { si: number; pi: number }) {
		const key = `${param.si}-${param.pi}`;
		pageEls.set(key, node);

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					activeSi = param.si;
					activePi = param.pi;
					reportCurrentProgress();
				}
			},
			{ threshold: 0, rootMargin: '0px 0px -60% 0px' }
		);
		observer.observe(node);

		return {
			destroy() {
				observer.disconnect();
				pageEls.delete(key);
			}
		};
	}

	function observeSentinel(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) onnearend?.();
			},
			{ rootMargin: '0px 0px 400px 0px', threshold: 0 }
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	onMount(() => {
		let scrollRafId: number;
		let retryTimers: ReturnType<typeof setTimeout>[] = [];

		if (initialPage > 0) {
			function scrollToTarget() {
				pageEls.get(`0-${initialPage}`)?.scrollIntoView({ block: 'start', behavior: 'instant' });
			}
			// Retry a few times as images above the target finish loading and establish height.
			scrollRafId = requestAnimationFrame(scrollToTarget);
			retryTimers.push(setTimeout(scrollToTarget, 400));
			retryTimers.push(setTimeout(scrollToTarget, 1200));
		}

		let rafId: number;
		function onScroll() {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(reportCurrentProgress);
		}

		window.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			window.removeEventListener('scroll', onScroll);
			cancelAnimationFrame(rafId);
			cancelAnimationFrame(scrollRafId);
			retryTimers.forEach(clearTimeout);
		};
	});

	const maxWidth = $derived(`${48 * zoom}rem`);
</script>

<div class="mx-auto {gap ? 'space-y-1' : ''}" style="max-width: {maxWidth}">
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
			<div class="overflow-hidden" use:observePage={{ si, pi }}>
				<img
					src={pageUrl}
					alt="Halaman {pi + 1}"
					class="mx-auto block w-full"
					loading={si === 0 && pi <= initialPage ? 'eager' : 'lazy'}
				/>
			</div>
		{/each}
	{/each}
	<div use:observeSentinel class="h-px"></div>
</div>
