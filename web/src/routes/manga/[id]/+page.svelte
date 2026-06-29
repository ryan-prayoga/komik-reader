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
	import LibraryButton from '$lib/components/LibraryButton.svelte';
	import type { Chapter, MangaDetail } from '$lib/graphql/types';

	const mangaId = $derived(Number($page.params.id));

	let manga = $state<MangaDetail | null>(null);
	let chapters = $state<Chapter[]>([]);
	let loading = $state(true);
	let downloadingAll = $state(false);
	let error = $state('');
	let notice = $state('');

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
		<p class="text-muted">Memuat detail...</p>
	{:else if error}
		<div class="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>
	{:else if manga}
		<div class="mb-8 flex flex-col gap-6 md:flex-row">
			<div class="mx-auto w-48 shrink-0 overflow-hidden rounded-xl border border-border bg-surface md:mx-0">
				{#if manga.thumbnailUrl}
					<img src={apiUrl(manga.thumbnailUrl)} alt={manga.title} class="w-full" />
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<h1 class="text-2xl font-semibold leading-tight">{manga.title}</h1>
					<LibraryButton
						mangaId={manga.id}
						inLibrary={manga.inLibrary}
						onchange={(value) => {
							if (manga) manga.inLibrary = value;
						}}
					/>
				</div>
				{#if manga.author}
					<p class="mt-2 text-sm text-muted">Author: {manga.author}</p>
				{/if}
				{#if manga.artist}
					<p class="text-sm text-muted">Artist: {manga.artist}</p>
				{/if}
				{#if manga.genre?.length}
					<div class="mt-3 flex flex-wrap gap-2">
						{#each manga.genre as g}
							<span class="rounded-full bg-surface px-2 py-1 text-xs text-muted">{g}</span>
						{/each}
					</div>
				{/if}
				{#if manga.description}
					<p class="mt-4 text-sm leading-relaxed text-muted whitespace-pre-line">
						{manga.description}
					</p>
				{/if}
				{#if chapters.length > 0}
					<button
						class="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
						disabled={downloadingAll}
						onclick={downloadAll}
					>
						{downloadingAll ? 'Mengantri...' : 'Download semua chapter'}
					</button>
				{/if}
			</div>
		</div>

		{#if notice}
			<div class="mb-4 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
				{notice}
				<a href="/downloads" class="ml-1 underline">Lihat antrian →</a>
			</div>
		{/if}

		<h2 class="mb-4 text-lg font-medium">Chapters ({chapters.length})</h2>
		{#if chapters.length === 0}
			<p class="text-muted">Belum ada chapter.</p>
		{:else}
			<div class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
				{#each chapters as chapter (chapter.id)}
					<div class="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-surface-hover">
						<a href="/read/{chapter.id}" class="min-w-0 flex-1">
							<p class="text-sm font-medium">{chapter.name}</p>
							<p class="text-xs text-muted">
								{#if formatDate(chapter.uploadDate)}{formatDate(chapter.uploadDate)}{/if}
								{#if chapter.isRead} · Read{/if}
							</p>
						</a>
						<DownloadButton
							chapterId={chapter.id}
							isDownloaded={chapter.isDownloaded}
							onqueued={() => {
								notice = 'Chapter masuk antrian download.';
							}}
						/>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</section>