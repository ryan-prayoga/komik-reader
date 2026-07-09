<script lang="ts">
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import {
		readerSettings,
		type ReaderMode,
		type ReaderFit,
		type ReaderBg,
		type ReaderDirection
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

	// Double-page spreads need horizontal room; force single-page on phones.
	let wideEnough = $state(true);
	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(min-width: 768px)');
		const sync = () => {
			wideEnough = mq.matches;
			if (!mq.matches && readerSettings.mode === 'double') {
				readerSettings.set('mode', 'paged');
			}
		};
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	const btnOn =
		'border-accent/40 bg-accent/15 text-accent';
	const btnOff =
		'border-white/15 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90';
</script>

<Sheet bind:open title="Pengaturan Reader" side="bottom" variant="dark">
	<div class="space-y-6">
		<!-- Mode -->
		<div>
			<p class="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">Mode</p>
			<div class="grid grid-cols-3 gap-2">
				{#each modes as m}
					<button
						type="button"
						disabled={m.value === 'double' && !wideEnough}
						title={m.value === 'double' && !wideEnough
							? 'Mode ganda butuh layar lebih lebar'
							: undefined}
						onclick={() => readerSettings.set('mode', m.value)}
						class="flex flex-col items-center gap-1.5 rounded-[var(--radius)] border px-3 py-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 {readerSettings.mode ===
						m.value
							? btnOn
							: btnOff}"
					>
						<m.icon size={18} />
						{m.label}
					</button>
				{/each}
			</div>
			{#if !wideEnough}
				<p class="mt-2 text-[11px] text-white/40">Mode ganda dinonaktifkan di layar sempit.</p>
			{/if}
		</div>

		<!-- Fit (paged/double only) -->
		{#if isPaged}
			<div>
				<p class="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">Penyesuaian</p>
				<div class="grid grid-cols-3 gap-2">
					{#each fits as f}
						<button
							type="button"
							onclick={() => readerSettings.set('fit', f.value)}
							class="rounded-[var(--radius)] border px-3 py-2 text-xs font-medium transition {readerSettings.fit ===
							f.value
								? btnOn
								: btnOff}"
						>
							{f.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Reading direction (paged/double) -->
			<div>
				<p class="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">Arah baca</p>
				<div class="grid grid-cols-2 gap-2">
					{#each [{ value: 'ltr', label: 'Kiri → Kanan' }, { value: 'rtl', label: 'Kanan → Kiri (manga)' }] as d}
						<button
							type="button"
							onclick={() => readerSettings.set('direction', d.value as ReaderDirection)}
							class="rounded-[var(--radius)] border px-3 py-2 text-xs font-medium transition {readerSettings.direction ===
							d.value
								? btnOn
								: btnOff}"
						>
							{d.label}
						</button>
					{/each}
				</div>
			</div>

			{#if readerSettings.mode === 'double' && wideEnough}
				<div class="rounded-[var(--radius)] border border-white/10 bg-white/5 p-3">
					<Switch
						label="Halaman pertama sendiri (offset spread)"
						checked={readerSettings.doubleOffset}
						onchange={(v) => readerSettings.set('doubleOffset', v)}
					/>
				</div>
			{/if}
		{:else}
			<div class="rounded-[var(--radius)] border border-white/10 bg-white/5 p-3">
				<Switch
					label="Jarak antar halaman"
					checked={readerSettings.gap}
					onchange={(v) => readerSettings.set('gap', v)}
				/>
			</div>
		{/if}

		<!-- Zoom -->
		<div>
			<div class="mb-2 flex items-center justify-between">
				<p class="text-xs font-medium uppercase tracking-wide text-white/50">Zoom</p>
				<span class="text-xs tabular-nums text-white/60">{Math.round(readerSettings.zoom * 100)}%</span>
			</div>
			<input
				type="range"
				min="0.5"
				max="2"
				step="0.1"
				value={readerSettings.zoom}
				oninput={(e) => readerSettings.set('zoom', Number(e.currentTarget.value))}
				class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-accent"
			/>
		</div>

		<!-- Brightness -->
		<div>
			<div class="mb-2 flex items-center justify-between">
				<p class="text-xs font-medium uppercase tracking-wide text-white/50">Kecerahan</p>
				<span class="text-xs tabular-nums text-white/60"
					>{Math.round(readerSettings.brightness * 100)}%</span
				>
			</div>
			<input
				type="range"
				min="0.2"
				max="1"
				step="0.05"
				value={readerSettings.brightness}
				oninput={(e) => readerSettings.set('brightness', Number(e.currentTarget.value))}
				class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-accent"
			/>
		</div>

		<!-- Background -->
		<div>
			<p class="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">Latar</p>
			<div class="grid grid-cols-3 gap-2">
				{#each bgs as b}
					<button
						type="button"
						onclick={() => readerSettings.set('bg', b.value)}
						class="flex items-center justify-center gap-2 rounded-[var(--radius)] border px-3 py-2 text-xs font-medium transition {readerSettings.bg ===
						b.value
							? btnOn
							: btnOff}"
					>
						<span class="h-4 w-4 rounded-full border border-white/20 {b.swatch}"></span>
						{b.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="space-y-3 rounded-[var(--radius)] border border-white/10 bg-white/5 p-3">
			<Switch
				label="Pin daftar chapter (desktop)"
				description="Dock kanan tetap terlihat saat chrome disembunyikan."
				checked={readerSettings.pinDock}
				onchange={(v) => readerSettings.set('pinDock', v)}
			/>
			<Switch
				label="Crop borders"
				description="Perbesar sedikit agar tepi putih scan terpotong."
				checked={readerSettings.cropBorders}
				onchange={(v) => readerSettings.set('cropBorders', v)}
			/>
		</div>

		<p class="text-[11px] leading-relaxed text-white/35">
			Pintasan: Esc tampilkan/sembunyikan kontrol · A auto-scroll · [ ] ganti chapter
		</p>
	</div>
</Sheet>
