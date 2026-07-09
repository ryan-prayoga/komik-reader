<script lang="ts">
	import { browser } from '$app/environment';
	import { fade } from 'svelte/transition';
	import { motionDuration } from '$lib/utils/motion';
	import { Button } from '$lib/components/ui';

	const KEY = 'komik-reader-coach-v1';

	interface Props {
		isWebtoon?: boolean;
	}
	let { isWebtoon = true }: Props = $props();

	let open = $state(false);

	$effect(() => {
		if (!browser) return;
		try {
			if (!localStorage.getItem(KEY)) open = true;
		} catch {
			/* ignore */
		}
	});

	function dismiss() {
		open = false;
		try {
			localStorage.setItem(KEY, '1');
		} catch {
			/* ignore */
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center"
		transition:fade={{ duration: motionDuration(180) }}
		role="dialog"
		aria-modal="true"
		aria-labelledby="reader-coach-title"
	>
		<div
			class="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-950 p-5 text-white shadow-(--shadow-float)"
			style="padding-bottom: calc(1.25rem + env(safe-area-inset-bottom))"
		>
			<p id="reader-coach-title" class="text-base font-semibold">Cara baca di sini</p>
			<ul class="mt-3 space-y-2 text-sm text-white/75">
				{#if isWebtoon}
					<li>· <strong class="text-white/90">Tap</strong> (tanpa geser) untuk kontrol</li>
					<li>· <strong class="text-white/90">Pinch</strong> untuk zoom</li>
					<li>
						· <strong class="text-white/90">Play</strong> auto-scroll — atur speed di pill
						bawah (tanpa stop)
					</li>
				{:else}
					<li>· <strong class="text-white/90">Tap kiri/kanan</strong> ganti halaman</li>
					<li>· <strong class="text-white/90">Tap tengah</strong> untuk kontrol</li>
					<li>· <strong class="text-white/90">Geser / pinch</strong> navigasi & zoom</li>
				{/if}
				<li>
					· Keyboard: <kbd class="rounded bg-white/10 px-1">Esc</kbd> kontrol ·
					<kbd class="rounded bg-white/10 px-1">A</kbd> auto-scroll ·
					<kbd class="rounded bg-white/10 px-1">[ ]</kbd> chapter
				</li>
			</ul>
			<div class="mt-5">
				<Button block onclick={dismiss}>Mengerti</Button>
			</div>
		</div>
	</div>
{/if}
