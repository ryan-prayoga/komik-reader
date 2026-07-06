<script lang="ts">
	import { onMount } from 'svelte';
	import type { Chapter } from '$lib/graphql/types';
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
		zoom?: number;
		gap?: boolean;
		initialPage?: number;
	}

	let { sections, onpage, onnearend, zoom = 1, gap = true, initialPage = 0 }: Props = $props();

	// Keyed by chapter id (not array index) so entries stay valid when `sections`
	// is pruned from the front — an index-based key would silently go stale and
	// point at the wrong chapter once earlier sections are dropped.
	const pageEls = new Map<string, HTMLElement>();
	let activeChapterId = 0;
	let activePi = 0;

	let loadedPages = $state<Record<string, boolean>>({});
	let errorPages = $state<Record<string, boolean>>({});
	let retryCounts = $state<Record<string, number>>({});
	function markLoaded(key: string) {
		loadedPages[key] = true;
		errorPages[key] = false;
	}
	function markError(key: string) {
		errorPages[key] = true;
	}
	function retryPage(key: string) {
		errorPages[key] = false;
		loadedPages[key] = false;
		retryCounts[key] = (retryCounts[key] ?? 0) + 1;
	}
	function pageSrc(url: string, key: string): string {
		const n = retryCounts[key];
		if (!n) return url;
		return `${url}${url.includes('?') ? '&' : '?'}_retry=${n}`;
	}

	function reportCurrentProgress() {
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

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					activeChapterId = param.chapterId;
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
		// Trigger a full viewport height before the true bottom so slow chapter
		// fetches finish before the user actually scrolls past the last page.
		const margin = Math.max(800, typeof window !== 'undefined' ? window.innerHeight : 0);
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) onnearend?.();
			},
			{ rootMargin: `0px 0px ${margin}px 0px`, threshold: 0 }
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

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

<div
	class="mx-auto {gap ? 'space-y-1' : ''}"
	style="max-width: {maxWidth}; overflow-anchor: none;"
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
			<div
				class="relative overflow-hidden"
				data-page-key={key}
				use:observePage={{ chapterId: section.chapter.id, pi }}
			>
				{#if errorPages[key]}
					<div
						class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/[0.03]"
					>
						<button
							type="button"
							class="rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20"
							onclick={() => retryPage(key)}
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
						: 'opacity-0'}"
					style="aspect-ratio: auto 2 / 3"
					loading={si === 0 && pi <= initialPage ? 'eager' : 'lazy'}
					decoding="async"
					onload={() => markLoaded(key)}
					onerror={() => markError(key)}
				/>
			</div>
		{/each}
	{/each}
	<div use:observeSentinel class="h-px"></div>
</div>
