<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import List from '@lucide/svelte/icons/list';
	import X from '@lucide/svelte/icons/x';
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
		onsettings: () => void;
		onseek?: (index: number) => void;
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
		onsettings,
		onseek
	}: Props = $props();

	let pickerOpen = $state(false);

	function scrollActiveTo(node: HTMLElement, isActive: boolean) {
		if (isActive) {
			setTimeout(() => node.scrollIntoView({ block: 'center' }), 80);
		}
	}
</script>

<!-- Thin progress bar — always visible, z above chrome -->
<div class="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-white/10">
	<div
		class="h-full bg-accent transition-[width] duration-150 ease-out"
		style="width: {scrollProgress * 100}%"
	></div>
</div>

<!-- Top bar -->
<div
	class="fixed inset-x-0 top-0 z-30 transition-transform duration-200 {show
		? 'translate-y-0'
		: '-translate-y-full'}"
>
	<div
		class="flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-3 pb-6 pt-4 text-white"
	>
		<a
			href={backHref}
			aria-label="Kembali"
			class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 transition hover:bg-black/60"
		>
			<ArrowLeft size={20} />
		</a>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-semibold leading-tight">{title}</p>
			<p class="truncate text-xs text-white/70">
				{chapterName}{#if offlineMode} · <span class="text-accent">Offline</span>{/if}
			</p>
		</div>
		<button
			type="button"
			onclick={onsettings}
			aria-label="Pengaturan reader"
			class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 transition hover:bg-black/60"
		>
			<SlidersHorizontal size={18} />
		</button>
	</div>
</div>

<!-- Bottom bar -->
<div
	class="fixed inset-x-0 bottom-0 z-30 transition-transform duration-200 {show
		? 'translate-y-0'
		: 'translate-y-full'}"
	style="padding-bottom: env(safe-area-inset-bottom)"
>
	<div
		class="flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-6 text-white"
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
					oninput={() => onseek?.(current)}
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
				class="flex flex-1 items-center justify-center gap-1.5 text-xs text-white/70 transition active:text-white"
			>
				<BookOpen size={14} class="shrink-0" />
				<span class="truncate">{chapterName || pageLabel}</span>
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
		transition:fade={{ duration: 200 }}
		class="fixed inset-0 z-40 bg-black/60"
		role="button"
		tabindex="-1"
		aria-label="Tutup picker"
		onclick={() => (pickerOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (pickerOpen = false)}
	></div>
	<div
		transition:fly={{ y: 320, duration: 260, opacity: 1 }}
		class="fixed inset-x-0 bottom-0 z-50 flex max-h-[65vh] flex-col rounded-t-2xl bg-[var(--color-surface)] shadow-2xl"
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
		<div class="overflow-y-auto">
			{#each chapters as ch (ch.id)}
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
