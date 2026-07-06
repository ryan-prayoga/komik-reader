<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { apiUrl } from '$lib/graphql/client';
	import { fetchChapters, fetchMangaDetail, markChapterRead, markChaptersRead } from '$lib/graphql/api';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import CategoryPicker from '$lib/components/CategoryPicker.svelte';
	import LibraryButton from '$lib/components/LibraryButton.svelte';
	import { localData } from '$lib/local/data.svelte';
	import { formatDuration, getMangaStats } from '$lib/reading-time';
	import { listOfflineChapters } from '$lib/offline/db';
	import { cacheChapterToDevice } from '$lib/offline/cache';
	import { Button, Badge, Card, EmptyState, Spinner, Input, Dropdown, IconButton } from '$lib/components/ui';
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
	import type { Chapter, MangaDetail } from '$lib/graphql/types';

	const mangaId = $derived(Number($page.params.id));

	let manga = $state<MangaDetail | null>(null);
	let chapters = $state<Chapter[]>([]);
	let loading = $state(true);
	let downloadingAll = $state(false);
	let downloadProgress = $state('');
	let error = $state('');
	let notice = $state('');
	let offlineIds = $state<Set<number>>(new Set());

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
	const mangaStats = $derived(getMangaStats(mangaId, localData.history));
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

	async function load() {
		manga = await fetchMangaDetail(mangaId);
		chapters = await fetchChapters(mangaId);
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
		notice = `${targets.length} chapter ditandai sudah dibaca.`;
	}

	async function downloadBatch(filter: 'all' | 'unread') {
		downloadingAll = true;
		downloadProgress = '';
		notice = '';
		error = '';
		try {
			const sorted = [...merged].sort((a, b) => a.sourceOrder - b.sourceOrder);
			const base = filter === 'unread' ? sorted.filter((c) => !c.read) : sorted;
			const targets = base.filter((c) => !offlineIds.has(c.id));
			if (targets.length === 0) {
				notice = filter === 'unread' ? 'Semua chapter belum dibaca sudah offline.' : 'Semua chapter sudah offline.';
				return;
			}
			let done = 0;
			let failed = 0;
			for (const c of targets) {
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
			notice =
				failed > 0
					? `${targets.length - failed} chapter tersimpan, ${failed} gagal.`
					: `${targets.length} chapter tersimpan di perangkat.`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal download';
		} finally {
			downloadingAll = false;
			downloadProgress = '';
		}
	}

	function formatDate(ts: string) {
		const n = Number(ts);
		if (!n) return '';
		return new Date(n).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<section>
	{#if loading}
		<div class="flex justify-center py-20 text-muted"><Spinner size={28} /></div>
	{:else if error}
		<div class="rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{:else if manga}
		<!-- Fixed back button -->
		<a
			href="/browse/{manga.sourceId}"
			class="fixed left-4 top-[68px] z-20 inline-flex items-center gap-1 rounded-full bg-bg/85 px-3 py-1.5 text-sm text-muted shadow backdrop-blur transition hover:text-accent lg:left-64 lg:top-4"
		>
			<ArrowLeft size={14} />
			Source
		</a>

		<!-- Hero with blurred backdrop -->
		<div class="relative -mx-4 -mt-4 lg:-mx-8 lg:-mt-8">
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
						<p class="whitespace-pre-line text-sm leading-relaxed text-muted">{manga.description}</p>
					{/if}
					{#if localData.isInLibrary(manga.id)}
						<div class="mt-6"><CategoryPicker mangaId={manga.id} /></div>
					{/if}
				</div>
			{/if}

			<div class="mt-6 min-w-0 flex-1 lg:mt-0">
				{#if notice}
					<div class="mb-6 flex items-start justify-between gap-2 rounded-[var(--radius)] border border-success/30 bg-success/10 p-3 text-sm text-success">
						<span>{notice}</span>
						<button onclick={() => (notice = '')} class="shrink-0 opacity-60 hover:opacity-100" aria-label="Tutup">✕</button>
					</div>
				{/if}

				<h2 class="mb-3 text-lg font-semibold text-text">
					Chapter ({visible.length}{visible.length !== chapters.length ? `/${chapters.length}` : ''})
				</h2>

				{#if chapters.length === 0}
					<EmptyState title="Belum ada chapter" description="Source belum menyediakan chapter." />
				{:else}
					<Card padding="none">
						<div class="divide-y divide-border">
							<!-- Toolbar row -->
							<div class="flex items-center gap-2 px-4 py-2.5">
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
										onclick={() => (sortDir = 'desc')}
										title="Terbaru dulu"
										class="rounded p-1.5 transition {sortDir === 'desc' ? 'bg-accent text-white' : 'text-muted hover:text-text'}"
									><ArrowDown size={13} /></button>
									<button
										onclick={() => (sortDir = 'asc')}
										title="Terlama dulu"
										class="rounded p-1.5 transition {sortDir === 'asc' ? 'bg-accent text-white' : 'text-muted hover:text-text'}"
									><ArrowUp size={13} /></button>
									<div class="mx-1 h-3.5 w-px bg-border"></div>
									<button
										onclick={() => (readFilter = readFilter === 'all' ? 'unread' : readFilter === 'unread' ? 'read' : 'all')}
										title={readFilter === 'all' ? 'Semua chapter' : readFilter === 'unread' ? 'Belum dibaca' : 'Sudah dibaca'}
										class="relative rounded p-1.5 transition {readFilter !== 'all' ? 'text-accent' : 'text-muted hover:text-text'}"
									>
										{#if readFilter === 'read'}<Eye size={13} />{:else}<EyeOff size={13} />{/if}
										{#if readFilter !== 'all'}<span class="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-accent"></span>{/if}
									</button>
									<button
										onclick={() => (downloadFilter = downloadFilter === 'all' ? 'downloaded' : downloadFilter === 'downloaded' ? 'not' : 'all')}
										title={downloadFilter === 'all' ? 'Semua chapter' : downloadFilter === 'downloaded' ? 'Sudah diunduh' : 'Belum diunduh'}
										class="relative rounded p-1.5 transition {downloadFilter !== 'all' ? 'text-accent' : 'text-muted hover:text-text'}"
									>
										{#if downloadFilter === 'not'}<CloudOff size={13} />{:else}<HardDriveDownload size={13} />{/if}
										{#if downloadFilter !== 'all'}<span class="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-accent"></span>{/if}
									</button>
								</div>
							</div>
							{#if visible.length === 0}
								<div class="px-4 py-10 text-center text-sm text-muted">Tidak ada chapter cocok.</div>
							{:else}
								{#each visible as chapter (chapter.id)}
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
													notice = 'Chapter tersimpan di perangkat.';
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
							{/if}
						</div>
					</Card>
				{/if}
			</div>
		</div>
	{/if}
</section>
