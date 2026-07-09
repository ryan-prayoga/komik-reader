<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto, afterNavigate } from '$app/navigation';
	import { apiUrl } from '$lib/graphql/client';
	import { fetchChapters, fetchMangaDetail, markChapterRead, markChaptersRead } from '$lib/graphql/api';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import CategoryPicker from '$lib/components/CategoryPicker.svelte';
	import LibraryButton from '$lib/components/LibraryButton.svelte';
	import { localData } from '$lib/local/data.svelte';
	import { syncEngine } from '$lib/local/sync.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { formatDuration, getMangaStats } from '$lib/reading-time';
	import { listOfflineChapters } from '$lib/offline/db';
	import { cacheChapterToDevice } from '$lib/offline/cache';
	import { Button, Badge, Card, EmptyState, Dropdown, IconButton } from '$lib/components/ui';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import Check from '@lucide/svelte/icons/check';
	import ImageOff from '@lucide/svelte/icons/image-off';
	import Search from '@lucide/svelte/icons/search';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import ChevronsDown from '@lucide/svelte/icons/chevrons-down';
	import ChevronsUp from '@lucide/svelte/icons/chevrons-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import HardDriveDownload from '@lucide/svelte/icons/hard-drive-download';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import Clock from '@lucide/svelte/icons/clock';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import type { Chapter, MangaDetail } from '$lib/graphql/types';

	const mangaId = $derived(Number($page.params.id));

	let manga = $state<MangaDetail | null>(null);
	let chapters = $state<Chapter[]>([]);
	let loading = $state(true);
	let downloadingAll = $state(false);
	let downloadProgress = $state('');
	let cancelDownload = $state(false);
	let error = $state('');
	let offlineIds = $state<Set<number>>(new Set());
	let descExpanded = $state(false);

	// Chapter list controls
	let search = $state('');
	let sortDir = $state<'desc' | 'asc'>('desc');
	let readFilter = $state<'all' | 'read' | 'unread'>('all');
	let downloadFilter = $state<'all' | 'downloaded' | 'not'>('all');

	// Local read-state overrides the server `isRead` (works for guests, syncs if
	// logged in). A chapter is "read" if a local history row says so, else server.
	const readMap = $derived(new Map(localData.history.map((h) => [h.chapterId, h.isRead])));
	const merged = $derived(
		chapters.map((c) => ({ ...c, read: readMap.has(c.id) ? !!readMap.get(c.id) : c.isRead }))
	);

	const unreadCount = $derived(merged.filter((c) => !c.read).length);
	const hasAnyRead = $derived(merged.some((c) => c.read));
	const mangaStats = $derived(
		getMangaStats(
			mangaId,
			localData.history,
			syncEngine.loggedIn ? localData.otherMsByChapter : undefined
		)
	);
	// Resume at the most recently touched chapter (matches home + history
	// pages) if it's still unread; otherwise oldest unread, else re-read.
	const lastTouched = $derived.by(() => {
		const rows = localData.history.filter((h) => h.mangaId === mangaId);
		return rows.length ? rows.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a)) : null;
	});
	const readTarget = $derived.by(() => {
		if (lastTouched && !lastTouched.isRead) {
			const c = merged.find((m) => m.id === lastTouched.chapterId);
			if (c) return c;
		}
		return [...merged].reverse().find((c) => !c.read) ?? merged[merged.length - 1] ?? null;
	});
	const startLabel = $derived(
		!hasAnyRead ? 'Mulai baca' : unreadCount > 0 ? 'Lanjutkan baca' : 'Baca ulang'
	);

	const visible = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const list = merged.filter((c) => {
			if (q && !c.name.toLowerCase().includes(q) && !String(c.chapterNumber).includes(q))
				return false;
			if (readFilter === 'read' && !c.read) return false;
			if (readFilter === 'unread' && c.read) return false;
			if (downloadFilter === 'downloaded' && !offlineIds.has(c.id)) return false;
			if (downloadFilter === 'not' && offlineIds.has(c.id)) return false;
			return true;
		});
		return list.sort((a, b) =>
			sortDir === 'asc' ? a.sourceOrder - b.sourceOrder : b.sourceOrder - a.sourceOrder
		);
	});

	// Chapter rows carry interactive controls (download button, dropdown) and
	// variable height (optional date line), which makes true windowed
	// virtualization risky — height math and scroll-anchor math both get
	// fragile. Incremental rendering gets the same win (DOM node count stays
	// bounded on 1000+ chapter series) without touching scroll position math.
	const RENDER_CHUNK = 150;
	let renderLimit = $state(RENDER_CHUNK);
	let chapterSentinel = $state<HTMLElement | null>(null);
	const rendered = $derived(visible.slice(0, renderLimit));

	// Reset the window whenever the filtered/sorted set changes shape — keyed
	// on length + edge ids so a plain read-state toggle (same set, same order)
	// doesn't collapse the list the user already scrolled through.
	let lastVisibleKey = '';
	$effect(() => {
		const key = `${visible.length}-${visible[0]?.id ?? ''}-${visible[visible.length - 1]?.id ?? ''}-${sortDir}`;
		if (key === lastVisibleKey) return;
		lastVisibleKey = key;
		renderLimit = RENDER_CHUNK;
	});

	$effect(() => {
		if (!chapterSentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && renderLimit < visible.length) {
					renderLimit = Math.min(visible.length, renderLimit + RENDER_CHUNK);
				}
			},
			{ rootMargin: '400px' }
		);
		observer.observe(chapterSentinel);
		return () => observer.disconnect();
	});

	async function load() {
		manga = await fetchMangaDetail(mangaId);
		chapters = await fetchChapters(mangaId);
	}

	let refreshing = $state(false);
	async function refreshChapters() {
		if (refreshing) return;
		refreshing = true;
		try {
			chapters = await fetchChapters(mangaId);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat chapter';
		} finally {
			refreshing = false;
		}
	}

	onMount(async () => {
		try {
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat detail manga';
		} finally {
			loading = false;
		}
		listOfflineChapters().then((list) => {
			offlineIds = new Set(list.map((c) => c.chapterId));
		});
	});

	function entryOf(c: Chapter) {
		return {
			chapterId: c.id,
			mangaId: manga!.id,
			mangaTitle: manga!.title,
			thumbnailUrl: manga!.thumbnailUrl ? apiUrl(manga!.thumbnailUrl) : null,
			chapterName: c.name,
			sourceId: manga!.sourceId,
			chapterNumber: c.chapterNumber
		};
	}

	async function toggleRead(c: Chapter & { read: boolean }) {
		const next = !c.read;
		await localData.setChapterRead(entryOf(c), next);
		markChapterRead(c.id, next).catch(() => {}); // best-effort server (owner only)
	}

	// "older" = chapters with <= chapterNumber (further down the list), "newer" = >=.
	async function markRange(c: Chapter, dir: 'older' | 'newer') {
		const targets = chapters.filter((x) =>
			dir === 'older' ? x.chapterNumber <= c.chapterNumber : x.chapterNumber >= c.chapterNumber
		);
		if (!targets.length) return;
		await localData.setManyChaptersRead(targets.map(entryOf), true);
		markChaptersRead(
			targets.map((x) => x.id),
			true
		).catch(() => {});
		showToast(`${targets.length} chapter ditandai sudah dibaca.`, 'success');
	}

	async function downloadBatch(filter: 'all' | 'unread') {
		downloadingAll = true;
		cancelDownload = false;
		downloadProgress = '';
		error = '';
		try {
			const sorted = [...merged].sort((a, b) => a.sourceOrder - b.sourceOrder);
			const base = filter === 'unread' ? sorted.filter((c) => !c.read) : sorted;
			const targets = base.filter((c) => !offlineIds.has(c.id));
			if (targets.length === 0) {
				showToast(filter === 'unread' ? 'Semua chapter belum dibaca sudah offline.' : 'Semua chapter sudah offline.', 'info');
				return;
			}
			let done = 0;
			let failed = 0;
			for (const c of targets) {
				if (cancelDownload) break;
				downloadProgress = `Mengunduh ${done + 1}/${targets.length}…`;
				try {
					await cacheChapterToDevice(c.id, mangaId, manga!.title, c.name, undefined, manga!.thumbnailUrl, manga!.sourceId);
					offlineIds = new Set([...offlineIds, c.id]);
				} catch {
					// Skip a failed chapter (already rolled back in cache.ts) and keep going.
					failed += 1;
				}
				done += 1;
			}
			const saved = done - failed;
			showToast(
				cancelDownload
					? `Dibatalkan — ${saved} chapter tersimpan.`
					: failed > 0
						? `${saved} chapter tersimpan, ${failed} gagal.`
						: `${targets.length} chapter tersimpan di perangkat.`,
				failed > 0 ? 'info' : 'success'
			);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal download';
		} finally {
			downloadingAll = false;
			cancelDownload = false;
			downloadProgress = '';
		}
	}

	// Prefer going back to wherever the user came from (library, history, home,
	// search) instead of always dumping them on the source browse page. Falls
	// back to the source grid on a cold deep-link with no in-app history.
	let cameFromApp = $state(false);
	afterNavigate(({ from }) => {
		if (from) cameFromApp = true;
	});
	function goBack() {
		if (cameFromApp) history.back();
		else goto(`/browse/${manga?.sourceId ?? ''}`);
	}

	function formatDate(ts: string) {
		const n = Number(ts);
		if (!n) return '';
		return new Date(n).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	const pageTitle = $derived(manga ? `${manga.title} · Komik Reader` : 'Detail · Komik Reader');
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<section class="pb-24 lg:pb-0">
	{#if loading}
		<div class="flex flex-col gap-6 md:flex-row">
			<div class="mx-auto aspect-[3/4] w-40 shrink-0 animate-pulse rounded-[var(--radius)] bg-surface-hover md:mx-0 md:w-48"></div>
			<div class="min-w-0 flex-1 space-y-3">
				<div class="h-7 w-3/4 animate-pulse rounded bg-surface-hover"></div>
				<div class="h-4 w-1/2 animate-pulse rounded bg-surface-hover"></div>
				<div class="h-4 w-2/5 animate-pulse rounded bg-surface-hover"></div>
				<div class="flex gap-2 pt-2">
					<div class="h-6 w-16 animate-pulse rounded-full bg-surface-hover"></div>
					<div class="h-6 w-16 animate-pulse rounded-full bg-surface-hover"></div>
				</div>
				<div class="h-11 w-full animate-pulse rounded-[var(--radius)] bg-surface-hover"></div>
			</div>
		</div>
		<div class="mt-8 space-y-2">
			{#each Array(6) as _, i (i)}
				<div class="h-14 w-full animate-pulse rounded-[var(--radius)] bg-surface-hover"></div>
			{/each}
		</div>
	{:else if error}
		<div class="rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{:else if manga}
		<!-- In-flow back control (avoids fixed offsets vs top bar / collapsed sidebar) -->
		<button
			type="button"
			onclick={goBack}
			class="mb-3 inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-muted transition hover:border-accent/40 hover:text-accent"
		>
			<ArrowLeft size={14} />
			Kembali
		</button>

		<!-- Hero with blurred backdrop -->
		<div class="relative -mx-4 lg:-mx-8">
			{#if manga.thumbnailUrl}
				<div class="absolute inset-0 overflow-hidden">
					<img src={apiUrl(manga.thumbnailUrl)} alt="" class="h-full w-full scale-110 object-cover blur-2xl" />
					<div class="absolute inset-0 bg-bg/80 backdrop-blur-sm"></div>
					<div class="absolute inset-0 bg-gradient-to-t from-bg to-transparent"></div>
				</div>
			{/if}

			<div class="relative flex flex-col gap-6 px-4 pb-6 pt-6 md:flex-row lg:px-8 lg:pt-10">
				<div class="mx-auto aspect-[3/4] w-40 shrink-0 overflow-hidden rounded-[var(--radius)] border border-border bg-surface shadow-(--shadow-float) md:mx-0 md:w-48">
					{#if manga.thumbnailUrl}
						<img src={apiUrl(manga.thumbnailUrl)} alt={manga.title} class="h-full w-full object-cover" />
					{:else}
						<div class="flex h-full items-center justify-center text-muted"><ImageOff size={28} /></div>
					{/if}
				</div>

				<div class="min-w-0 flex-1">
					<h1 class="text-2xl font-bold leading-tight text-text md:text-3xl">{manga.title}</h1>
					<div class="mt-2 space-y-0.5 text-sm text-muted">
						{#if manga.author}<p>Author: {manga.author}</p>{/if}
						{#if manga.artist && manga.artist !== manga.author}<p>Artist: {manga.artist}</p>{/if}
						<p>{chapters.length} chapter · {unreadCount} belum dibaca</p>
						{#if mangaStats && mangaStats.totalMs > 0}
							<p class="flex items-center gap-1.5">
								<Clock size={13} class="shrink-0" />
								<span>Total {formatDuration(mangaStats.totalMs)} dibaca di perangkat ini</span>
							</p>
						{/if}
					</div>

					{#if manga.genre?.length}
						<div class="mt-3 flex flex-wrap gap-1.5">
							{#each manga.genre as g}<Badge tone="outline">{g}</Badge>{/each}
						</div>
					{/if}

					<!-- Sticky action row -->
					<div class="mt-5 flex flex-col gap-2">
						{#if readTarget}
							<Button href="/read/{readTarget.id}" size="lg" block class="justify-start text-left">
								<BookOpen size={18} class="shrink-0" />
								<span class="flex min-w-0 flex-col leading-tight">
									<span class="font-semibold">{startLabel}</span>
									<span class="truncate text-xs font-normal text-white/80">{readTarget.name}</span>
								</span>
							</Button>
						{/if}
						<div class="flex flex-wrap gap-2">
							<LibraryButton
								mangaId={manga.id}
								title={manga.title}
								thumbnailUrl={manga.thumbnailUrl ? apiUrl(manga.thumbnailUrl) : null}
								sourceId={manga.sourceId}
							/>
							{#if chapters.length > 0}
								<Dropdown align="left">
									{#snippet trigger({ toggle })}
										<Button variant="secondary" loading={downloadingAll} onclick={toggle}>
											<DownloadIcon size={16} /> Download
										</Button>
									{/snippet}
									{#snippet children({ close })}
										<button
											class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text hover:bg-surface-hover"
											onclick={() => { downloadBatch('all'); close(); }}
										>
											<DownloadIcon size={15} /> Semua chapter
										</button>
										<button
											class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text hover:bg-surface-hover"
											onclick={() => { downloadBatch('unread'); close(); }}
										>
											<DownloadIcon size={15} /> Belum dibaca saja
										</button>
									{/snippet}
								</Dropdown>
							{/if}
							{#if downloadProgress}
								<span class="inline-flex items-center text-xs text-muted">{downloadProgress}</span>
								<Button variant="ghost" size="sm" onclick={() => (cancelDownload = true)}>Batal</Button>
							{/if}
						</div>
					</div>
			</div>
		</div>
		</div>

		<div class="lg:flex lg:items-start lg:gap-8">
			{#if manga.description || localData.isInLibrary(manga.id)}
				<div class="mt-6 lg:sticky lg:top-8 lg:mt-0 lg:w-72 lg:shrink-0">
					{#if manga.description}
						<p class="whitespace-pre-line text-sm leading-relaxed text-muted {descExpanded ? '' : 'line-clamp-4'}">{manga.description}</p>
						{#if (manga.description?.length ?? 0) > 180}
							<button
								type="button"
								onclick={() => (descExpanded = !descExpanded)}
								class="mt-1 text-xs font-medium text-accent hover:underline"
							>
								{descExpanded ? 'Ciutkan' : 'Selengkapnya'}
							</button>
						{/if}
					{/if}
					{#if localData.isInLibrary(manga.id)}
						<div class="mt-6"><CategoryPicker mangaId={manga.id} /></div>
					{/if}
				</div>
			{/if}

			<div class="mt-6 min-w-0 flex-1 lg:mt-0">

				<div class="mb-3 flex items-center justify-between gap-2">
					<h2 class="text-lg font-semibold text-text">
						Chapter ({visible.length}{visible.length !== chapters.length ? `/${chapters.length}` : ''})
					</h2>
					<button
						type="button"
						onclick={refreshChapters}
						disabled={refreshing}
						aria-label="Muat ulang daftar chapter"
						title="Cek chapter baru"
						class="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-muted transition hover:bg-surface-hover hover:text-text disabled:opacity-50"
					>
						<RefreshCw size={15} class={refreshing ? 'animate-spin' : ''} />
					</button>
				</div>

				{#if chapters.length === 0}
					<EmptyState title="Belum ada chapter" description="Source belum menyediakan chapter." />
				{:else}
					<Card padding="none">
						<div class="divide-y divide-border">
							<!-- Toolbar row -->
							<div class="space-y-2 px-4 py-2.5">
								<div class="flex items-center gap-2">
									<div class="relative flex-1">
										<Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
										<input
											bind:value={search}
											placeholder="Cari chapter…"
											class="w-full rounded-md border border-border bg-bg py-1.5 pl-8 pr-3 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
										/>
									</div>
									<div class="flex items-center rounded-md border border-border bg-bg p-0.5">
										<button
											type="button"
											onclick={() => (sortDir = 'desc')}
											title="Terbaru dulu"
											aria-label="Urut terbaru dulu"
											class="rounded p-1.5 transition {sortDir === 'desc' ? 'bg-accent text-white' : 'text-muted hover:text-text'}"
										><ArrowDown size={13} /></button>
										<button
											type="button"
											onclick={() => (sortDir = 'asc')}
											title="Terlama dulu"
											aria-label="Urut terlama dulu"
											class="rounded p-1.5 transition {sortDir === 'asc' ? 'bg-accent text-white' : 'text-muted hover:text-text'}"
										><ArrowUp size={13} /></button>
									</div>
								</div>
								<div class="flex flex-wrap gap-1.5">
									<button
										type="button"
										onclick={() => (readFilter = 'all')}
										class="rounded-full px-2.5 py-1 text-[11px] font-medium transition {readFilter === 'all'
											? 'bg-accent text-white'
											: 'bg-surface-hover text-muted hover:text-text'}"
									>Semua</button>
									<button
										type="button"
										onclick={() => (readFilter = 'unread')}
										class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition {readFilter === 'unread'
											? 'bg-accent text-white'
											: 'bg-surface-hover text-muted hover:text-text'}"
									><EyeOff size={11} /> Belum dibaca</button>
									<button
										type="button"
										onclick={() => (readFilter = 'read')}
										class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition {readFilter === 'read'
											? 'bg-accent text-white'
											: 'bg-surface-hover text-muted hover:text-text'}"
									><Eye size={11} /> Sudah dibaca</button>
									<button
										type="button"
										onclick={() => (downloadFilter = downloadFilter === 'downloaded' ? 'all' : 'downloaded')}
										class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition {downloadFilter === 'downloaded'
											? 'bg-accent text-white'
											: 'bg-surface-hover text-muted hover:text-text'}"
									><HardDriveDownload size={11} /> Offline</button>
									<button
										type="button"
										onclick={() => (downloadFilter = downloadFilter === 'not' ? 'all' : 'not')}
										class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition {downloadFilter === 'not'
											? 'bg-accent text-white'
											: 'bg-surface-hover text-muted hover:text-text'}"
									><CloudOff size={11} /> Belum unduh</button>
								</div>
							</div>
							{#if visible.length === 0}
								<div class="px-4 py-10 text-center text-sm text-muted">Tidak ada chapter cocok.</div>
							{:else}
								{#each rendered as chapter (chapter.id)}
									<div class="flex items-center justify-between gap-2 px-4 py-3 transition hover:bg-surface-hover">
										<a href="/read/{chapter.id}" class="flex min-w-0 flex-1 items-center gap-3">
											{#if chapter.read}
												<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
													<Check size={13} />
												</span>
											{:else}
												<span class="h-2 w-2 shrink-0 rounded-full bg-accent"></span>
											{/if}
											<div class="min-w-0">
												<p class="truncate text-sm font-medium {chapter.read ? 'text-muted' : 'text-text'}">
													{chapter.name}
												</p>
												{#if formatDate(chapter.uploadDate)}
													<p class="text-xs text-muted">{formatDate(chapter.uploadDate)}</p>
												{/if}
											</div>
										</a>
										<div class="flex shrink-0 items-center gap-1">
											<DownloadButton
												chapterId={chapter.id}
												isOffline={offlineIds.has(chapter.id)}
												mangaId={mangaId}
												mangaTitle={manga?.title}
												chapterName={chapter.name}
												thumbnailUrl={manga?.thumbnailUrl}
												sourceId={manga?.sourceId}
												oncached={() => {
													offlineIds = new Set([...offlineIds, chapter.id]);
													showToast('Chapter tersimpan di perangkat.', 'success');
												}}
											/>
											<Dropdown align="right">
												{#snippet trigger({ toggle })}
													<IconButton label="Aksi chapter" variant="ghost" size="sm" onclick={toggle}>
														<EllipsisVertical size={16} />
													</IconButton>
												{/snippet}
												{#snippet children({ close })}
													<button
														class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text hover:bg-surface-hover"
														onclick={() => {
															toggleRead(chapter);
															close();
														}}
													>
														{#if chapter.read}<EyeOff size={15} /> Tandai belum dibaca
														{:else}<Eye size={15} /> Tandai sudah dibaca{/if}
													</button>
													<button
														class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text hover:bg-surface-hover"
														onclick={() => {
															markRange(chapter, 'older');
															close();
														}}
													>
														{#if sortDir === 'desc'}<ChevronsDown size={15} />{:else}<ChevronsUp size={15} />{/if} Tandai ini & sebelumnya
													</button>
												{/snippet}
											</Dropdown>
										</div>
									</div>
								{/each}
								{#if renderLimit < visible.length}
									<div bind:this={chapterSentinel} class="px-4 py-3 text-center text-xs text-muted">
										Memuat chapter lainnya…
									</div>
								{/if}
							{/if}
						</div>
					</Card>
				{/if}
			</div>
		</div>

		<!-- Sticky mobile CTA — keeps "lanjut baca" reachable while scrolling a long chapter list -->
		{#if readTarget}
			<div
				class="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-bg/95 px-4 py-2 backdrop-blur lg:hidden"
				style="padding-bottom: calc(0.5rem + env(safe-area-inset-bottom))"
			>
				<Button href="/read/{readTarget.id}" size="md" block class="justify-start text-left">
					<BookOpen size={16} class="shrink-0" />
					<span class="flex min-w-0 flex-col leading-tight">
						<span class="text-sm font-semibold">{startLabel}</span>
						<span class="truncate text-[11px] font-normal text-white/80">{readTarget.name}</span>
					</span>
				</Button>
			</div>
		{/if}
	{/if}
</section>
