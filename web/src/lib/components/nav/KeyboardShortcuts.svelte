<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Modal from '$lib/components/ui/Modal.svelte';

	// Desktop-only shortcuts: "/" jumps to search, "g" + a letter jumps to a section.
	const GOTO: Record<string, string> = {
		h: '/',
		l: '/library',
		r: '/history',
		d: '/downloads',
		s: '/settings'
	};

	const HELP: { keys: string; label: string }[] = [
		{ keys: '/', label: 'Fokus ke pencarian' },
		{ keys: '? ', label: 'Tampilkan bantuan ini' },
		{ keys: 'g lalu h', label: 'Ke Beranda' },
		{ keys: 'g lalu l', label: 'Ke Koleksi' },
		{ keys: 'g lalu r', label: 'Ke Riwayat' },
		{ keys: 'g lalu d', label: 'Ke Unduhan' },
		{ keys: 'g lalu s', label: 'Ke Pengaturan' }
	];

	let helpOpen = $state(false);
	let pendingGoto = $state(false);
	let pendingTimer: ReturnType<typeof setTimeout> | undefined;

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return (
			target.tagName === 'INPUT' ||
			target.tagName === 'TEXTAREA' ||
			target.tagName === 'SELECT' ||
			target.isContentEditable
		);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target)) return;
		// Reader has its own surface — don't steal `/` mid-chapter into search.
		if ($page.url.pathname.startsWith('/read/')) return;

		if (pendingGoto) {
			pendingGoto = false;
			clearTimeout(pendingTimer);
			const href = GOTO[e.key];
			if (href) {
				e.preventDefault();
				goto(href);
			}
			return;
		}

		if (e.key === '/') {
			e.preventDefault();
			goto('/search');
		} else if (e.key === '?') {
			e.preventDefault();
			helpOpen = true;
		} else if (e.key === 'g') {
			pendingGoto = true;
			pendingTimer = setTimeout(() => (pendingGoto = false), 600);
		}
	}
</script>

<svelte:window {onkeydown} />

<Modal bind:open={helpOpen} title="Pintasan Keyboard">
	<div class="divide-y divide-border">
		{#each HELP as row}
			<div class="flex items-center justify-between gap-4 py-2">
				<span class="text-sm text-text">{row.label}</span>
				<kbd class="rounded border border-border bg-surface px-2 py-0.5 font-mono text-xs text-muted">{row.keys}</kbd>
			</div>
		{/each}
	</div>
</Modal>
