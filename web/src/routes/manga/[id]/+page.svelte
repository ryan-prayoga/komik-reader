<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { apiUrl } from '$lib/graphql/client';
	import {
		enqueueChapterDownloads,
		fetchChapters,
		fetchMangaDetail,
		markChapterRead,
		markChaptersRead,
		startDownloader
	} from '$lib/graphql/api';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import CategoryPicker from '$lib/components/CategoryPicker.svelte';
	import LibraryButton from '$lib/components/LibraryButton.svelte';
	import { localData } from '$lib/local/data.svelte';
	import { Button, Badge, Card, EmptyState, Spinner, Input, Select, Dropdown, IconButton } from '$lib/components/ui';
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
	import type { Chapter, MangaDetail } from '$lib/graphql/types';

	const mangaId = $derived(Number($page.params.id));

	let manga = $state<MangaDetail | null>(null);
	let chapters = $state<Chapter[]>([]);
	let loading = $state(true);
	let downloadingAll = $state(false);
	let error = $state('');
	let notice = $state('');

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
	// Oldest unread (list is newest-first), else oldest chapter to re-read.
	const readTarget = $derived(
		[...merged].reverse().find((c) => !c.read) ?? merged[merged.length - 1] ?? null
	);
	const startLabel = $derived(
		!hasAnyRead ? 'Mulai baca' : unreadCount > 0 ? 'Baca selanjutnya' : 'Baca ulang'
	);

	const visible = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const list = merged.filter((c) => {
			if (q && !c.name.toLowerCase().includes(q) && !String(c.chapterNumber).includes(q))
				return false;
			if (readFilter === 'read' && !c.read) return false;
			if (readFilter === 'unread' && c.read) return false;
			if (downloadFilter === 'downloaded' && !c.isDownloaded) return false;
			if (downloadFilter === 'not' && c.isDownloaded) return false;
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

	async function downloadAll() {
		const pending = chapters.filter((c) => !c.isDownloaded).map((c) => c.id);
		if (pending.length === 0) {
			notice = 'Semua chapter sudah terdownload.';
			return;
		}
		downloadingAll = true;
		notice = '';
		error = '';
		try {
			await startDownloader();
			await enqueueChapterDownloads(pending);
			notice = `${pending.length} chapter masuk antrian. Cek halaman Downloads.`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal antri download';
		} finally {
			downloadingAll = false;
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
		<div class="relative -mx-4 -mt-4 overflow-hidden lg:-mx-8 lg:-mt-8">
			{#if manga.thumbnailUrl}
				<div class="absolute inset-0">
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
					</div>

					{#if manga.genre?.length}
						<div class="mt-3 flex flex-wrap gap-1.5">
							{#each manga.genre as g}<Badge tone="outline">{g}</Badge>{/each}
						</div>
					{/if}

					<!-- Sticky action row -->
					<div class="mt-5 flex flex-wrap gap-2">
						{#if readTarget}
							<Button href="/read/{readTarget.id}">
								<BookOpen size={16} />
								{startLabel}
							</Button>
						{/if}
						<LibraryButton
							mangaId={manga.id}
							title={manga.title}
							thumbnailUrl={manga.thumbnailUrl ? apiUrl(manga.thumbnailUrl) : null}
							sourceId={manga.sourceId}
						/>
						{#if chapters.length > 0}
							<Button variant="secondary" loading={downloadingAll} onclick={downloadAll}>
								<DownloadIcon size={16} /> Semua
							</Button>
						{/if}
					</div>
				</div>
			</div>
		</div>

		{#if manga.description}
			<p class="mt-6 whitespace-pre-line text-sm leading-relaxed text-muted">{manga.description}</p>
		{/if}

		{#if localData.isInLibrary(manga.id)}
			<div class="mt-6"><CategoryPicker mangaId={manga.id} /></div>
		{/if}

		{#if notice}
			<div class="mt-6 rounded-[var(--radius)] border border-success/30 bg-success/10 p-3 text-sm text-success">
				{notice}
				{#if notice.includes('antrian')}
					<a href="/downloads" class="ml-1 underline">Lihat antrian →</a>
				{/if}
			</div>
		{/if}

		<h2 class="mb-3 mt-8 text-lg font-semibold text-text">
			Chapter ({visible.length}{visible.length !== chapters.length ? `/${chapters.length}` : ''})
		</h2>

		{#if chapters.length === 0}
			<EmptyState title="Belum ada chapter" description="Source belum menyediakan chapter." />
		{:else}
			<!-- Search / sort / filter toolbar -->
			<div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
				<Input bind:value={search} placeholder="Cari chapter…" class="sm:flex-1">
					{#snippet icon()}<Search size={16} />{/snippet}
				</Input>
				<div class="grid grid-cols-3 gap-2 sm:flex sm:w-auto">
					<Select bind:value={sortDir} class="sm:w-32" aria-label="Urutkan">
						<option value="desc">Terbaru</option>
						<option value="asc">Terlama</option>
					</Select>
					<Select bind:value={readFilter} class="sm:w-36" aria-label="Filter baca">
						<option value="all">Semua</option>
						<option value="unread">Belum dibaca</option>
						<option value="read">Sudah dibaca</option>
					</Select>
					<Select bind:value={downloadFilter} class="sm:w-40" aria-label="Filter download">
						<option value="all">Semua</option>
						<option value="downloaded">Terdownload</option>
						<option value="not">Belum download</option>
					</Select>
				</div>
			</div>

			{#if visible.length === 0}
				<EmptyState title="Tidak ada chapter cocok" description="Ubah pencarian atau filter." />
			{:else}
				<Card padding="none">
					<div class="divide-y divide-border">
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
										isDownloaded={chapter.isDownloaded}
										onqueued={() => (notice = 'Chapter masuk antrian download.')}
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
					</div>
				</Card>
			{/if}
		{/if}
	{/if}
</section>
