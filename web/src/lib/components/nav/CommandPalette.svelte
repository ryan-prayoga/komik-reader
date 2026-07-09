<script lang="ts">
	import { goto } from '$app/navigation';
	import { fade, scale } from 'svelte/transition';
	import { trapFocus } from '$lib/utils/focusTrap';
	import { motionDuration } from '$lib/utils/motion';
	import { localData } from '$lib/local/data.svelte';
	import { primaryNav, manageNav } from '$lib/nav';
	import Search from '@lucide/svelte/icons/search';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import History from '@lucide/svelte/icons/history';

	interface Props {
		open?: boolean;
	}
	let { open = $bindable(false) }: Props = $props();

	let query = $state('');
	let active = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);

	type Item = {
		id: string;
		label: string;
		hint?: string;
		href: string;
		group: string;
	};

	const navItems = $derived.by((): Item[] => {
		const list: Item[] = [];
		for (const n of primaryNav) {
			list.push({ id: `nav-${n.href}`, label: n.label, href: n.href, group: 'Navigasi' });
		}
		for (const n of manageNav) {
			list.push({ id: `nav-${n.href}`, label: n.label, href: n.href, group: 'Navigasi' });
		}
		list.push({
			id: 'nav-search-q',
			label: 'Cari judul…',
			hint: 'Buka halaman cari',
			href: '/search',
			group: 'Navigasi'
		});
		return list;
	});

	const libraryItems = $derived.by((): Item[] => {
		if (!localData.ready) return [];
		return localData.library.slice(0, 40).map((m) => ({
			id: `lib-${m.mangaId}`,
			label: m.title,
			href: `/manga/${m.mangaId}`,
			group: 'Koleksi',
			hint: 'Koleksi'
		}));
	});

	const historyItems = $derived.by((): Item[] => {
		if (!localData.ready) return [];
		const seen = new Set<number>();
		const out: Item[] = [];
		for (const h of localData.history) {
			if (seen.has(h.mangaId)) continue;
			seen.add(h.mangaId);
			out.push({
				id: `hist-${h.mangaId}`,
				label: h.mangaTitle,
				hint: h.chapterName,
				href: h.isRead ? `/manga/${h.mangaId}` : `/read/${h.chapterId}`,
				group: 'Riwayat'
			});
			if (out.length >= 15) break;
		}
		return out;
	});

	const results = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const all = [...navItems, ...libraryItems, ...historyItems];
		if (!q) return all.slice(0, 20);
		const scored = all
			.map((item) => {
				const hay = `${item.label} ${item.hint ?? ''} ${item.href}`.toLowerCase();
				const idx = hay.indexOf(q);
				return { item, idx };
			})
			.filter((x) => x.idx >= 0)
			.sort((a, b) => a.idx - b.idx || a.item.label.localeCompare(b.item.label));
		// Prefer exact search jump when typing
		const jump: Item = {
			id: 'search-jump',
			label: `Cari “${query.trim()}”`,
			hint: 'Buka pencarian',
			href: `/search?q=${encodeURIComponent(query.trim())}`,
			group: 'Cari'
		};
		return [jump, ...scored.map((s) => s.item)].slice(0, 24);
	});

	$effect(() => {
		// Reset highlight when result set changes
		results;
		active = 0;
	});

	$effect(() => {
		if (open) {
			query = '';
			active = 0;
			queueMicrotask(() => inputEl?.focus());
		}
	});

	function close() {
		open = false;
	}

	function go(item: Item) {
		close();
		void goto(item.href);
	}

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(results.length - 1, active + 1);
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(0, active - 1);
			return;
		}
		if (e.key === 'Enter' && results[active]) {
			e.preventDefault();
			go(results[active]);
		}
	}
</script>

<svelte:window onkeydown={open ? onKey : undefined} />

{#if open}
	<div class="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[12vh]">
		<button
			type="button"
			aria-label="Tutup"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			transition:fade={{ duration: motionDuration(150) }}
			onclick={close}
		></button>
		<div
			use:trapFocus
			transition:scale={{ duration: motionDuration(160), start: 0.96 }}
			class="panel-cut relative z-10 w-full max-w-lg border-[1.5px] border-border bg-bg shadow-(--shadow-float)"
			role="dialog"
			aria-modal="true"
			aria-label="Command palette"
		>
			<div class="flex items-center gap-2 border-b border-border px-3 py-3">
				<Search size={16} class="shrink-0 text-muted" />
				<input
					bind:this={inputEl}
					bind:value={query}
					placeholder="Lompat ke halaman, koleksi, atau cari…"
					class="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
				/>
				<kbd class="hidden rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted sm:inline"
					>esc</kbd
				>
			</div>
			<div class="max-h-[50vh] overflow-y-auto py-1">
				{#if results.length === 0}
					<p class="px-4 py-6 text-center text-sm text-muted">Tidak ada hasil.</p>
				{:else}
					{#each results as item, i (item.id)}
						<button
							type="button"
							onclick={() => go(item)}
							onmouseenter={() => (active = i)}
							class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition {i === active
								? 'bg-accent/15 text-accent'
								: 'text-text hover:bg-surface-hover'}"
						>
							{#if item.group === 'Riwayat'}
								<History size={15} class="shrink-0 opacity-70" />
							{:else if item.group === 'Koleksi'}
								<BookOpen size={15} class="shrink-0 opacity-70" />
							{:else}
								<Search size={15} class="shrink-0 opacity-70" />
							{/if}
							<span class="min-w-0 flex-1 truncate font-medium">{item.label}</span>
							{#if item.hint}
								<span class="max-w-[40%] truncate text-xs text-muted">{item.hint}</span>
							{/if}
						</button>
					{/each}
				{/if}
			</div>
			<p class="border-t border-border px-4 py-2 text-[11px] text-muted">
				↑↓ pilih · Enter buka · Esc tutup
			</p>
		</div>
	</div>
{/if}
