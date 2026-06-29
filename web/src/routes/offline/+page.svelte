<script lang="ts">
	import { onMount } from 'svelte';
	import { listOfflineChapters, type OfflineChapter } from '$lib/offline/db';
	import { removeChapterFromDevice } from '$lib/offline/cache';

	let chapters = $state<OfflineChapter[]>([]);
	let loading = $state(true);

	onMount(async () => {
		chapters = await listOfflineChapters();
		loading = false;
	});

	async function remove(chapterId: number) {
		await removeChapterFromDevice(chapterId);
		chapters = chapters.filter((c) => c.chapterId !== chapterId);
	}

	function formatDate(ts: number) {
		return new Date(ts).toLocaleString('id-ID');
	}
</script>

<section>
	<div class="mb-6">
		<h1 class="text-2xl font-semibold">Offline di Perangkat</h1>
		<p class="mt-1 text-sm text-muted">
			Chapter yang sudah di-cache bisa dibaca tanpa internet.
		</p>
	</div>

	{#if loading}
		<p class="text-muted">Memuat...</p>
	{:else if chapters.length === 0}
		<div class="rounded-xl border border-border bg-surface p-8 text-center">
			<p class="text-muted">Belum ada chapter offline.</p>
			<p class="mt-2 text-sm text-muted">
				Download chapter di server, lalu tap <strong>Simpan offline</strong> di
				<a href="/downloads" class="text-accent hover:underline">Downloads</a>.
			</p>
		</div>
	{:else}
		<div class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
			{#each chapters as chapter (chapter.chapterId)}
				<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
					<div>
						<p class="text-sm font-medium">{chapter.mangaTitle}</p>
						<p class="text-xs text-muted">
							{chapter.chapterName} · {chapter.pageCount} halaman · {formatDate(chapter.cachedAt)}
						</p>
					</div>
					<div class="flex gap-2">
						<a
							href="/read/{chapter.chapterId}"
							class="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
						>
							Baca
						</a>
						<button
							class="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-danger hover:text-danger"
							onclick={() => remove(chapter.chapterId)}
						>
							Hapus
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>