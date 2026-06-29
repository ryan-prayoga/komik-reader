<script lang="ts">
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import {
		readerSettings,
		type ReaderMode,
		type ReaderFit,
		type ReaderBg
	} from '$lib/reader-settings.svelte';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Columns2 from '@lucide/svelte/icons/columns-2';

	interface Props {
		open?: boolean;
	}
	let { open = $bindable(false) }: Props = $props();

	const modes: { value: ReaderMode; label: string; icon: typeof BookOpen }[] = [
		{ value: 'webtoon', label: 'Webtoon', icon: ScrollText },
		{ value: 'paged', label: 'Halaman', icon: BookOpen },
		{ value: 'double', label: 'Ganda', icon: Columns2 }
	];
	const fits: { value: ReaderFit; label: string }[] = [
		{ value: 'width', label: 'Lebar' },
		{ value: 'height', label: 'Tinggi' },
		{ value: 'original', label: 'Asli' }
	];
	const bgs: { value: ReaderBg; label: string; swatch: string }[] = [
		{ value: 'black', label: 'Hitam', swatch: 'bg-black' },
		{ value: 'gray', label: 'Abu', swatch: 'bg-neutral-700' },
		{ value: 'white', label: 'Putih', swatch: 'bg-white' }
	];

	const isPaged = $derived(readerSettings.mode !== 'webtoon');
</script>

<Sheet bind:open title="Pengaturan Reader" side="bottom">
	<div class="space-y-6">
		<!-- Mode -->
		<div>
			<p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Mode</p>
			<div class="grid grid-cols-3 gap-2">
				{#each modes as m}
					<button
						type="button"
						onclick={() => readerSettings.set('mode', m.value)}
						class="flex flex-col items-center gap-1.5 rounded-[var(--radius)] border px-3 py-3 text-xs font-medium transition {readerSettings.mode ===
						m.value
							? 'border-accent/40 bg-accent/15 text-accent'
							: 'border-border bg-surface text-muted hover:bg-surface-hover'}"
					>
						<m.icon size={18} />
						{m.label}
					</button>
				{/each}
			</div>
		</div>

		<!-- Fit (paged/double only) -->
		{#if isPaged}
			<div>
				<p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Penyesuaian</p>
				<div class="grid grid-cols-3 gap-2">
					{#each fits as f}
						<button
							type="button"
							onclick={() => readerSettings.set('fit', f.value)}
							class="rounded-[var(--radius)] border px-3 py-2 text-xs font-medium transition {readerSettings.fit ===
							f.value
								? 'border-accent/40 bg-accent/15 text-accent'
								: 'border-border bg-surface text-muted hover:bg-surface-hover'}"
						>
							{f.label}
						</button>
					{/each}
				</div>
			</div>
		{:else}
			<Switch
				label="Jarak antar halaman"
				checked={readerSettings.gap}
				onchange={(v) => readerSettings.set('gap', v)}
			/>
		{/if}

		<!-- Zoom -->
		<div>
			<div class="mb-2 flex items-center justify-between">
				<p class="text-xs font-medium uppercase tracking-wide text-muted">Zoom</p>
				<span class="text-xs tabular-nums text-muted">{Math.round(readerSettings.zoom * 100)}%</span>
			</div>
			<input
				type="range"
				min="0.5"
				max="2"
				step="0.1"
				value={readerSettings.zoom}
				oninput={(e) => readerSettings.set('zoom', Number(e.currentTarget.value))}
				class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-hover accent-accent"
			/>
		</div>

		<!-- Brightness -->
		<div>
			<div class="mb-2 flex items-center justify-between">
				<p class="text-xs font-medium uppercase tracking-wide text-muted">Kecerahan</p>
				<span class="text-xs tabular-nums text-muted">{Math.round(readerSettings.brightness * 100)}%</span>
			</div>
			<input
				type="range"
				min="0.2"
				max="1"
				step="0.05"
				value={readerSettings.brightness}
				oninput={(e) => readerSettings.set('brightness', Number(e.currentTarget.value))}
				class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-hover accent-accent"
			/>
		</div>

		<!-- Background -->
		<div>
			<p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Latar</p>
			<div class="grid grid-cols-3 gap-2">
				{#each bgs as b}
					<button
						type="button"
						onclick={() => readerSettings.set('bg', b.value)}
						class="flex items-center justify-center gap-2 rounded-[var(--radius)] border px-3 py-2 text-xs font-medium transition {readerSettings.bg ===
						b.value
							? 'border-accent/40 text-accent'
							: 'border-border text-muted hover:bg-surface-hover'}"
					>
						<span class="h-4 w-4 rounded-full border border-border {b.swatch}"></span>
						{b.label}
					</button>
				{/each}
			</div>
		</div>
	</div>
</Sheet>
