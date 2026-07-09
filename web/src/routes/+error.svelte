<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui';
	import House from '@lucide/svelte/icons/house';
	import Search from '@lucide/svelte/icons/search';

	const status = $derived($page.status);
	const message = $derived($page.error?.message ?? 'Terjadi kesalahan.');
	const is404 = $derived(status === 404);
</script>

<section class="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
	<span
		class="panel-cut [--panel-cut:10px] mb-6 flex h-14 w-14 items-center justify-center bg-accent text-xl font-bold text-white"
	>
		K
	</span>
	<p class="font-display text-6xl font-bold tabular-nums tracking-tight text-text">{status}</p>
	<h1 class="mt-2 font-display text-2xl font-bold uppercase tracking-tight text-text">
		{is404 ? 'Halaman tidak ditemukan' : 'Ada yang salah'}
	</h1>
	<p class="mt-2 max-w-sm text-sm text-muted">
		{is404
			? 'Link mungkin rusak atau halaman sudah dipindah. Coba kembali ke beranda.'
			: message}
	</p>
	<div class="mt-8 flex flex-wrap items-center justify-center gap-2">
		<Button href="/">
			<House size={16} /> Beranda
		</Button>
		<Button href="/search" variant="secondary">
			<Search size={16} /> Cari komik
		</Button>
	</div>
</section>
