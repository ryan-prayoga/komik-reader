<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import BookOpen from '@lucide/svelte/icons/book-open';

	interface Props {
		show: boolean;
		title: string;
		pageLabel: string;
		backHref: string;
		prevHref?: string | null;
		nextHref?: string | null;
		showSlider?: boolean;
		current?: number;
		max?: number;
		offlineMode?: boolean;
		onsettings: () => void;
		onseek?: (index: number) => void;
	}

	let {
		show,
		title,
		pageLabel,
		backHref,
		prevHref,
		nextHref,
		showSlider = false,
		current = $bindable(0),
		max = 0,
		offlineMode = false,
		onsettings,
		onseek
	}: Props = $props();
</script>

<!-- Top bar -->
<div
	class="fixed inset-x-0 top-0 z-30 transition-transform duration-200 {show
		? 'translate-y-0'
		: '-translate-y-full'}"
>
	<div class="flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-3 pb-6 pt-3 text-white">
		<a
			href={backHref}
			aria-label="Kembali"
			class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 transition hover:bg-black/60"
		>
			<ArrowLeft size={20} />
		</a>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium">{title}</p>
			<p class="text-xs text-white/70">
				{pageLabel}{#if offlineMode} · <span class="text-accent">Offline</span>{/if}
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
	<div class="flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-6 text-white">
		{#if prevHref}
			<a
				href={prevHref}
				class="inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-2 text-xs transition hover:bg-black/60"
			>
				<ChevronLeft size={16} /> Prev
			</a>
		{:else}
			<span class="inline-flex items-center gap-1 rounded-full bg-black/20 px-3 py-2 text-xs text-white/40">
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
			<div class="flex flex-1 items-center justify-center text-xs text-white/70">
				<BookOpen size={14} class="mr-1.5" />
				{pageLabel}
			</div>
		{/if}

		{#if nextHref}
			<a
				href={nextHref}
				class="inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-2 text-xs transition hover:bg-black/60"
			>
				Next <ChevronRight size={16} />
			</a>
		{:else}
			<span class="inline-flex items-center gap-1 rounded-full bg-black/20 px-3 py-2 text-xs text-white/40">
				Next <ChevronRight size={16} />
			</span>
		{/if}
	</div>
</div>
