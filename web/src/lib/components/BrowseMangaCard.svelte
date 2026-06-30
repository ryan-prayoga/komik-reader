<script lang="ts">
	import type { BrowseManga } from '$lib/graphql/types';
	import { apiUrl } from '$lib/graphql/client';
	import { setMangaInLibrary } from '$lib/graphql/api';
	import ImageOff from '@lucide/svelte/icons/image-off';
	import Bookmark from '@lucide/svelte/icons/bookmark';

	interface Props {
		manga: BrowseManga;
		href: string;
	}

	let { manga, href }: Props = $props();

	let inLibrary = $state(manga.inLibrary);
	let saving = $state(false);

	async function toggleLibrary(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (saving) return;
		saving = true;
		const next = !inLibrary;
		inLibrary = next;
		try {
			await setMangaInLibrary(manga.id, next);
		} catch {
			inLibrary = !next;
		} finally {
			saving = false;
		}
	}

	const FORMAT_KEYS = ['manhwa', 'manhua', 'webtoon', 'manga', 'oel', 'comics'];

	const formatMap: Record<string, { label: string; cls: string }> = {
		manhwa: { label: 'MANHWA', cls: 'bg-blue-500/80 text-white' },
		manhua: { label: 'MANHUA', cls: 'bg-amber-500/80 text-white' },
		webtoon: { label: 'WEBTOON', cls: 'bg-violet-500/80 text-white' },
		oel: { label: 'OEL', cls: 'bg-emerald-500/80 text-white' },
		comics: { label: 'COMICS', cls: 'bg-emerald-500/80 text-white' }
	};

	const statusMap: Record<string, { dot: string; label: string }> = {
		ONGOING: { dot: 'bg-green-400', label: 'Ongoing' },
		COMPLETED: { dot: 'bg-blue-400', label: 'Selesai' },
		HIATUS: { dot: 'bg-yellow-400', label: 'Hiatus' },
		ABANDONED: { dot: 'bg-red-400', label: 'Dropped' }
	};

	const format = $derived(() => {
		const lower = (manga.genre ?? []).map((g) => g.toLowerCase());
		for (const key of Object.keys(formatMap)) {
			if (lower.includes(key)) return formatMap[key];
		}
		return null;
	});

	const displayGenres = $derived(() => {
		return (manga.genre ?? [])
			.filter((g) => !FORMAT_KEYS.includes(g.toLowerCase()))
			.slice(0, 3);
	});

	const statusInfo = $derived(() => statusMap[manga.status] ?? null);

	function relativeTime(raw: string): string {
		if (!raw || raw === '0') return '';
		const ts = Number(raw);
		const date = ts > 1e10 ? new Date(ts) : new Date(ts * 1000);
		if (isNaN(date.getTime())) return '';
		const diff = Date.now() - date.getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 60) return `${mins}m lalu`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}j lalu`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}h lalu`;
		return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
	}

	function chapterLabel(num: number): string {
		return Number.isInteger(num) ? `Ch.${num}` : `Ch.${num.toFixed(1)}`;
	}
</script>

<a
	{href}
	class="group relative flex flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-surface shadow-(--shadow-card) transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-hover hover:shadow-(--shadow-pop) active:scale-[0.98]"
>
	<div class="relative aspect-[3/4] overflow-hidden bg-bg">
		{#if manga.thumbnailUrl}
			<img
				src={apiUrl(manga.thumbnailUrl)}
				alt={manga.title}
				class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
				loading="lazy"
			/>
		{:else}
			<div class="flex h-full items-center justify-center text-muted">
				<ImageOff size={28} />
			</div>
		{/if}

		{#if format()}
			<span class="absolute left-2 top-3 rounded-md px-2 py-1 text-[11px] font-bold tracking-wide backdrop-blur-sm {format()!.cls}">
				{format()!.label}
			</span>
		{/if}

		<button
			type="button"
			onclick={toggleLibrary}
			class="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-xl transition {inLibrary ? 'text-accent' : 'text-white/70 opacity-0 group-hover:opacity-100'} {saving ? 'pointer-events-none opacity-60' : ''}"
			aria-label={inLibrary ? 'Hapus dari library' : 'Tambah ke library'}
		>
			<Bookmark size={22} fill={inLibrary ? 'currentColor' : 'none'} stroke-width={2} />
		</button>

		{#if statusInfo()}
			<span class="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 backdrop-blur-sm">
				<span class="h-1.5 w-1.5 rounded-full {statusInfo()!.dot}"></span>
				<span class="text-[10px] font-medium text-white">{statusInfo()!.label}</span>
			</span>
		{/if}

		<div class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition group-hover:opacity-100"></div>
	</div>

	<div class="flex flex-1 flex-col gap-1.5 p-2.5">
		<h3 class="line-clamp-2 text-sm font-medium leading-snug text-text">{manga.title}</h3>

		{#if displayGenres().length > 0}
			<div class="flex flex-wrap gap-1">
				{#each displayGenres() as genre}
					<span class="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] leading-none text-muted">
						{genre}
					</span>
				{/each}
			</div>
		{/if}

		{#if manga.latestUploadedChapter}
			{@const ch = manga.latestUploadedChapter}
			<p class="text-[11px] text-muted">
				{chapterLabel(ch.chapterNumber)}
				{#if ch.uploadDate && ch.uploadDate !== '0'}
					<span class="opacity-70">· {relativeTime(ch.uploadDate)}</span>
				{/if}
			</p>
		{/if}
	</div>
</a>
