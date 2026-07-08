<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { motionDuration } from '$lib/utils/motion';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import List from '@lucide/svelte/icons/list';
	import X from '@lucide/svelte/icons/x';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Search from '@lucide/svelte/icons/search';
	import type { Chapter } from '$lib/graphql/types';

	interface Props {
		show: boolean;
		title: string;
		chapterName: string;
		pageLabel: string;
		backHref: string;
		prevHref?: string | null;
		nextHref?: string | null;
		showSlider?: boolean;
		current?: number;
		max?: number;
		offlineMode?: boolean;
		scrollProgress?: number;
		chapters?: Chapter[];
		currentChapterId?: number;
		autoScroll?: boolean;
		autoScrollSpeed?: number;
		onsettings: () => void;
		onseek?: (index: number) => void;
		onautoscroll?: () => void;
		onautoscrollspeed?: (delta: number) => void;
	}

	let {
		show,
		title,
		chapterName,
		pageLabel,
		backHref,
		prevHref,
		nextHref,
		showSlider = false,
		current = $bindable(0),
		max = 0,
		offlineMode = false,
		scrollProgress = 0,
		chapters = [],
		currentChapterId,
		autoScroll = false,
		autoScrollSpeed = 2,
		onsettings,
		onseek,
		onautoscroll,
		onautoscrollspeed
	}: Props = $props();

	let pickerOpen = $state(false);
	let pickerQuery = $state('');
	const hasChapters = $derived(chapters.length > 0);

	// Picker/dock reads oldest-to-newest (reading order) — `chapters` prop itself
	// comes in newest-first (used for prev/next index math elsewhere), so flip it
	// just for display.
	const orderedChapters = $derived([...chapters].reverse());

	// Filtered chapter list for the picker/dock — matches name or chapter number so
	// long series (100s of chapters) stay navigable.
	const filteredChapters = $derived.by(() => {
		const q = pickerQuery.trim().toLowerCase();
		if (!q) return orderedChapters;
		return orderedChapters.filter(
			(c) => c.name.toLowerCase().includes(q) || String(c.chapterNumber).includes(q)
		);
	});

	function scrollActiveTo(node: HTMLElement, isActive: boolean) {
		if (isActive) {
			setTimeout(() => node.scrollIntoView({ block: 'center' }), 80);
		}
	}
</script>

<!-- Thin progress bar — always visible, z above chrome -->
<div
	class="pointer-events-none fixed inset-x-0 z-[60] h-0.5 {hasChapters ? 'lg:right-72' : ''}"
	style="top: max(0.125rem, env(safe-area-inset-top))"
>
	<div
		class="h-full bg-accent transition-[width] duration-150 ease-out"
		style="width: {scrollProgress * 100}%"
	></div>
</div>

<!-- Top bar -->
<div
	class="fixed inset-x-0 top-0 z-30 transition-transform duration-200 {hasChapters ? 'lg:right-72' : ''} {show
		? 'translate-y-0'
		: '-translate-y-full'}"
>
	<div
		class="flex items-center gap-2 bg-gradient-to-b from-black/45 via-black/15 to-transparent px-3 pb-6 text-white [&_button]:[text-shadow:none]"
		style="padding-top: calc(env(safe-area-inset-top) + 0.75rem)"
	>
		<a
			href={backHref}
			aria-label="Kembali"
			class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/40 transition hover:bg-black/60"
		>
			<ArrowLeft size={20} />
		</a>
		<div class="min-w-0 flex-1 pl-0.5 [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]">
			<p class="truncate text-sm font-semibold leading-tight">{title}</p>
			<p class="truncate text-xs text-white/70">
				{chapterName}{#if offlineMode} · <span class="text-accent">Offline</span>{/if}
			</p>
		</div>
		{#if onautoscroll}
			{#if autoScroll}
				<!-- Active: compact speed control -->
				<div class="flex items-center gap-0.5 rounded-full bg-black/50 px-1 py-1">
					<button
						onclick={() => onautoscrollspeed?.(-0.5)}
						class="flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white/70 hover:bg-white/10"
					>−</button>
					<span class="w-7 text-center text-[11px] tabular-nums text-white/90">{autoScrollSpeed}×</span>
					<button
						onclick={() => onautoscrollspeed?.(+0.5)}
						class="flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white/70 hover:bg-white/10"
					>+</button>
				</div>
			{/if}
			<button
				type="button"
				onclick={onautoscroll}
				aria-label={autoScroll ? 'Stop auto-scroll' : 'Auto-scroll'}
				class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition
					{autoScroll ? 'bg-accent text-white' : 'bg-black/40 hover:bg-black/60'}"
			>
				{#if autoScroll}<Pause size={16} />{:else}<Play size={16} />{/if}
			</button>
		{/if}
		<button
			type="button"
			onclick={onsettings}
			aria-label="Pengaturan reader"
			class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/40 transition hover:bg-black/60"
		>
			<SlidersHorizontal size={18} />
		</button>
	</div>
</div>

<!-- Bottom bar -->
<div
	class="fixed inset-x-0 bottom-0 z-30 transition-transform duration-200 {hasChapters ? 'lg:right-72' : ''} {show
		? 'translate-y-0'
		: 'translate-y-full'}"
>
	<div
		class="flex items-center gap-3 bg-gradient-to-t from-black/50 via-black/15 to-transparent px-3 pt-8 text-white"
		style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom))"
	>
		{#if prevHref}
			<a
				href={prevHref}
				class="inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-2 text-xs transition hover:bg-black/60"
			>
				<ChevronLeft size={16} /> Prev
			</a>
		{:else}
			<span
				class="inline-flex items-center gap-1 rounded-full bg-black/20 px-3 py-2 text-xs text-white/40"
			>
				<ChevronLeft size={16} /> Prev
			</span>
		{/if}

		{#if showSlider && max > 0}
			<div class="flex flex-1 items-center gap-2">
				<input
					type="range"
					min="0"
					max={max}
					bind:value={current}
					onchange={() => onseek?.(current)}
					class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-accent"
					aria-label="Posisi halaman"
				/>
				<span class="w-12 shrink-0 text-right text-xs tabular-nums text-white/70">
					{current + 1}/{max + 1}
				</span>
			</div>
		{:else}
			<button
				type="button"
				onclick={() => {
					if (chapters.length > 0) pickerOpen = true;
				}}
				class="flex flex-1 items-center justify-center gap-1.5 text-xs text-white/70 transition active:text-white {hasChapters ? 'lg:hidden' : ''}"
			>
				<BookOpen size={14} class="shrink-0" />
				<span class="truncate">{chapterName || pageLabel}</span>
				{#if chapterName}<span class="shrink-0 tabular-nums text-white/50">· {pageLabel}</span>{/if}
				{#if chapters.length > 0}
					<List size={12} class="shrink-0 opacity-50" />
				{/if}
			</button>
		{/if}

		{#if nextHref}
			<a
				href={nextHref}
				class="inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-2 text-xs transition hover:bg-black/60"
			>
				Next <ChevronRight size={16} />
			</a>
		{:else}
			<span
				class="inline-flex items-center gap-1 rounded-full bg-black/20 px-3 py-2 text-xs text-white/40"
			>
				Next <ChevronRight size={16} />
			</span>
		{/if}
	</div>
</div>

<!-- Chapter picker -->
{#if pickerOpen}
	<div
		transition:fade={{ duration: motionDuration(200) }}
		class="fixed inset-0 z-40 bg-black/60"
		role="button"
		tabindex="-1"
		aria-label="Tutup picker"
		onclick={() => (pickerOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (pickerOpen = false)}
	></div>
	<div
		transition:fly={{ y: 320, duration: motionDuration(260), opacity: 1 }}
		class="fixed inset-x-0 bottom-0 z-50 flex max-h-[65vh] flex-col rounded-t-2xl bg-neutral-900 shadow-(--shadow-float)"
		style="padding-bottom: env(safe-area-inset-bottom)"
	>
		<div
			class="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3"
		>
			<span class="text-sm font-semibold text-white">Pilih Chapter</span>
			<button
				type="button"
				onclick={() => (pickerOpen = false)}
				class="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10"
			>
				<X size={16} />
			</button>
		</div>
		<div class="shrink-0 border-b border-white/10 px-3 py-2">
			<div class="relative">
				<Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
				<input
					bind:value={pickerQuery}
					placeholder="Cari chapter…"
					class="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-sm text-white placeholder:text-white/40 focus:border-accent focus:outline-none"
				/>
			</div>
		</div>
		<div class="overflow-y-auto">
			{#each filteredChapters as ch (ch.id)}
				{@const isActive = ch.id === currentChapterId}
				<a
					href="/read/{ch.id}"
					onclick={() => (pickerOpen = false)}
					use:scrollActiveTo={isActive}
					class="flex items-center px-4 py-3 text-sm transition hover:bg-white/5 {isActive
						? 'font-medium text-accent'
						: ch.isRead
							? 'text-white/40'
							: 'text-white/80'}"
				>
					{ch.name}
				</a>
			{/each}
		</div>
	</div>
{/if}

<!-- Desktop-only chapter dock — a persistent right rail, replaces the tap-to-open picker on lg:. -->
{#if hasChapters}
	<aside
		class="fixed inset-y-0 right-0 z-30 hidden w-72 flex-col border-l border-white/10 bg-black/70 backdrop-blur-sm transition-opacity duration-200 lg:flex {show
			? 'opacity-100'
			: 'pointer-events-none opacity-0'}"
	>
		<div class="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-4 text-white">
			<List size={16} class="shrink-0 opacity-70" />
			<span class="text-sm font-semibold">Daftar Chapter</span>
		</div>
		<div class="shrink-0 border-b border-white/10 px-3 py-2">
			<div class="relative">
				<Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
				<input
					bind:value={pickerQuery}
					placeholder="Cari chapter…"
					class="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-sm text-white placeholder:text-white/40 focus:border-accent focus:outline-none"
				/>
			</div>
		</div>
		<div class="flex-1 overflow-y-auto">
			{#each filteredChapters as ch (ch.id)}
				{@const isActive = ch.id === currentChapterId}
				<a
					href="/read/{ch.id}"
					use:scrollActiveTo={isActive}
					class="flex items-center px-4 py-2.5 text-sm transition hover:bg-white/5 {isActive
						? 'bg-white/10 font-medium text-accent'
						: ch.isRead
							? 'text-white/40'
							: 'text-white/80'}"
				>
					{ch.name}
				</a>
			{/each}
		</div>
	</aside>
{/if}
