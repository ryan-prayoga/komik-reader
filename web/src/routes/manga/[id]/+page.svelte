<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { apiUrl } from '$lib/graphql/client';
	import {
		enqueueChapterDownloads,
		fetchChapters,
		fetchMangaDetail,
		startDownloader
	} from '$lib/graphql/api';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import CategoryPicker from '$lib/components/CategoryPicker.svelte';
	import LibraryButton from '$lib/components/LibraryButton.svelte';
	import { localData } from '$lib/local/data.svelte';
	import { Button, Badge, Card, EmptyState, Spinner } from '$lib/components/ui';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import Check from '@lucide/svelte/icons/check';
	import ImageOff from '@lucide/svelte/icons/image-off';
	import type { Chapter, MangaDetail } from '$lib/graphql/types';

	const mangaId = $derived(Number($page.params.id));

	let manga = $state<MangaDetail | null>(null);
	let chapters = $state<Chapter[]>([]);
	let loading = $state(true);
	let downloadingAll = $state(false);
	let error = $state('');
	let notice = $state('');

	const unreadCount = $derived(chapters.filter((c) => !c.isRead).length);
	// Oldest unread chapter (assume newest-first ordering), else fall back to first.
	const readTarget = $derived(
		[...chapters].reverse().find((c) => !c.isRead) ?? chapters[chapters.length - 1] ?? null
	);

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
		return new Date(n).toLocaleDateString('id-ID');
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
								{unreadCount > 0 ? 'Baca selanjutnya' : 'Baca ulang'}
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
				<a href="/downloads" class="ml-1 underline">Lihat antrian →</a>
			</div>
		{/if}

		<h2 class="mb-3 mt-8 text-lg font-semibold text-text">Chapter ({chapters.length})</h2>
		{#if chapters.length === 0}
			<EmptyState title="Belum ada chapter" description="Source belum menyediakan chapter." />
		{:else}
			<Card padding="none">
				<div class="divide-y divide-border">
					{#each chapters as chapter (chapter.id)}
						<div class="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-surface-hover">
							<a href="/read/{chapter.id}" class="flex min-w-0 flex-1 items-center gap-3">
								{#if chapter.isRead}
									<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
										<Check size={13} />
									</span>
								{:else}
									<span class="h-2 w-2 shrink-0 rounded-full bg-accent"></span>
								{/if}
								<div class="min-w-0">
									<p class="truncate text-sm font-medium {chapter.isRead ? 'text-muted' : 'text-text'}">
										{chapter.name}
									</p>
									{#if formatDate(chapter.uploadDate)}
										<p class="text-xs text-muted">{formatDate(chapter.uploadDate)}</p>
									{/if}
								</div>
							</a>
							<DownloadButton
								chapterId={chapter.id}
								isDownloaded={chapter.isDownloaded}
								onqueued={() => (notice = 'Chapter masuk antrian download.')}
							/>
						</div>
					{/each}
				</div>
			</Card>
		{/if}
	{/if}
</section>
