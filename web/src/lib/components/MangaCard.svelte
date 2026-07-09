<script lang="ts">
	import type { Manga, BrowseManga } from '$lib/graphql/types';
	import { apiUrl } from '$lib/graphql/client';
	import { setMangaInLibrary } from '$lib/graphql/api';
	import { localData } from '$lib/local/data.svelte';
	import { updates } from '$lib/updates/updates.svelte';
	import { relativeTimeShort, chapterLabel } from '$lib/utils/format';
	import { imgFallback } from '$lib/utils/imgFallback';
	import ImageOff from '@lucide/svelte/icons/image-off';
	import Bookmark from '@lucide/svelte/icons/bookmark';

	interface Props {
		manga: Manga | BrowseManga;
		href: string;
		/** Show the add/remove-from-library toggle (browse/search contexts). */
		showLibraryToggle?: boolean;
		/** 0–100 progress toward finishing the current chapter (library resume). */
		progressPercent?: number | null;
		/** Small label over the progress bar, e.g. chapter name. */
		progressLabel?: string | null;
		/** Show "Baru" badge when library has a newer chapter than last seen. */
		hasUpdate?: boolean;
		class?: string;
	}

	let {
		manga,
		href,
		showLibraryToggle = false,
		progressPercent = null,
		progressLabel = null,
		hasUpdate = false,
		class: klass = ''
	}: Props = $props();

	// BrowseManga carries genre/status/latestUploadedChapter — plain Manga doesn't.
	const rich = $derived('genre' in manga ? (manga as BrowseManga) : null);

	const inLibrary = $derived(localData.isInLibrary(manga.id));
	let saving = $state(false);

	async function toggleLibrary(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (saving) return;
		saving = true;
		try {
			const next = await localData.toggleLibrary({
				mangaId: manga.id,
				title: manga.title,
				thumbnailUrl: manga.thumbnailUrl,
				sourceId: manga.sourceId
			});
			if (!next) void updates.remove(manga.id);
			// Best-effort: also flag it in-library on the source server (extension
			// update crons key off this). Local state above is the source of truth.
			await setMangaInLibrary(manga.id, next).catch(() => {});
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

	const format = $derived.by(() => {
		if (!rich) return null;
		const lower = (rich.genre ?? []).map((g) => g.toLowerCase());
		for (const key of Object.keys(formatMap)) {
			if (lower.includes(key)) return formatMap[key];
		}
		return null;
	});

	const displayGenres = $derived.by(() =>
		rich ? (rich.genre ?? []).filter((g) => !FORMAT_KEYS.includes(g.toLowerCase())).slice(0, 3) : []
	);

	const statusInfo = $derived(rich ? (statusMap[rich.status] ?? null) : null);
</script>

<a
	{href}
	class="panel-cut group relative flex flex-col overflow-hidden border-[1.5px] border-border bg-surface shadow-(--shadow-card) transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-hover hover:shadow-(--shadow-pop) active:scale-[0.98] {klass}"
>
	<div class="relative aspect-[3/4] overflow-hidden bg-bg">
		{#if manga.thumbnailUrl}
			<img
				src={apiUrl(manga.thumbnailUrl)}
				alt={manga.title}
				class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
				loading="lazy"
				use:imgFallback
			/>
		{:else}
			<div class="flex h-full items-center justify-center text-muted">
				<ImageOff size={28} />
			</div>
		{/if}

		{#if hasUpdate}
			<span
				class="absolute left-2 top-2 z-[1] rounded-[var(--radius-sm)] bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow"
			>
				Baru
			</span>
		{:else if format}
			<span
				class="absolute left-2 top-3 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-bold tracking-wide backdrop-blur-sm {format.cls}"
			>
				{format.label}
			</span>
		{/if}

		{#if showLibraryToggle}
			<button
				type="button"
				onclick={toggleLibrary}
				class="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-xl bg-black/30 backdrop-blur-sm transition {inLibrary
					? 'text-accent'
					: 'text-white/80 opacity-100 lg:opacity-0 lg:group-hover:opacity-100'} {saving ? 'pointer-events-none opacity-60' : ''}"
				aria-label={inLibrary ? 'Hapus dari library' : 'Tambah ke library'}
			>
				<Bookmark size={22} fill={inLibrary ? 'currentColor' : 'none'} stroke-width={2} />
			</button>
		{/if}

		{#if statusInfo}
			<span
				class="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 backdrop-blur-sm"
			>
				<span class="h-1.5 w-1.5 rounded-full {statusInfo.dot}"></span>
				<span class="text-[10px] font-medium text-white">{statusInfo.label}</span>
			</span>
		{/if}

		<!-- Desktop-only reveal: genre tags, like a comic panel opening on hover. -->
		{#if displayGenres.length > 0}
			<div
				class="pointer-events-none absolute inset-x-0 bottom-0 hidden translate-y-full flex-wrap gap-1 bg-gradient-to-t from-black/85 to-transparent p-2 pt-6 opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 lg:flex"
			>
				{#each displayGenres as genre}
					<span class="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] leading-none text-white">
						{genre}
					</span>
				{/each}
			</div>
		{/if}

		{#if progressLabel || (progressPercent != null && progressPercent > 0)}
			<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
				{#if progressLabel}
					<p class="truncate text-[10px] font-medium text-white/90">{progressLabel}</p>
				{/if}
				{#if progressPercent != null && progressPercent > 0}
					<div class="mt-1 h-[3px] overflow-hidden rounded-full bg-white/20">
						<div class="h-full rounded-full bg-accent" style="width: {Math.min(100, progressPercent)}%"></div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="p-3">
		<h3 class="line-clamp-2 text-sm font-medium leading-snug text-text">{manga.title}</h3>
		{#if rich}
			<!-- Reserve the chapter line even before enrichment lands, so the grid
			     doesn't reflow when latestUploadedChapter streams in async. -->
			<p class="mt-0.5 h-4 truncate text-xs text-muted">
				{#if rich.latestUploadedChapter}
					{chapterLabel(rich.latestUploadedChapter.chapterNumber)}
					{#if rich.latestUploadedChapter.uploadDate && rich.latestUploadedChapter.uploadDate !== '0'}
						<span class="opacity-70">· {relativeTimeShort(rich.latestUploadedChapter.uploadDate)}</span>
					{/if}
				{/if}
			</p>
		{/if}
	</div>
</a>
