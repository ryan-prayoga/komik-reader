<script lang="ts">
	import { onMount } from 'svelte';
	import { getInstalledSources, getRecentlyReadChapters } from '$lib/graphql/api';
	import { preferences } from '$lib/preferences.svelte';
	import type { RecentChapter, Source } from '$lib/graphql/types';
	import { apiUrl } from '$lib/graphql/client';

	let sources = $state<Source[]>([]);
	let recent = $state<RecentChapter[]>([]);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			const [installed, chapters] = await Promise.all([
				getInstalledSources(preferences.nsfwFilter),
				getRecentlyReadChapters(6)
			]);
			sources = installed;
			recent = chapters;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat source';
		} finally {
			loading = false;
		}
	});
</script>

<section>
	<div class="mb-6">
		<h1 class="text-2xl font-semibold">Source Terinstall</h1>
		<p class="mt-1 text-sm text-muted">
			Install extension dulu di
			<a href="/extensions" class="text-accent hover:underline">Extensions</a>
			untuk menampilkan source baca komik.
		</p>
	</div>

	{#if loading}
		<p class="text-muted">Memuat...</p>
	{:else if error}
		<div class="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm">
			<p class="font-medium text-danger">Suwayomi tidak terhubung</p>
			<p class="mt-1 text-muted">{error}</p>
			<p class="mt-2 text-muted">
				Jalankan <code class="rounded bg-surface px-1">cd suwayomi && ./bootstrap.sh</code>
			</p>
		</div>
	{:else}
		{#if recent.length > 0}
			<div class="mb-8">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-lg font-medium">Lanjut Baca</h2>
					<a href="/library" class="text-sm text-accent hover:underline">Library →</a>
				</div>
				<div class="flex gap-4 overflow-x-auto pb-2">
					{#each recent as chapter (chapter.id)}
						<a
							href="/read/{chapter.id}"
							class="w-32 shrink-0 overflow-hidden rounded-xl border border-border bg-surface transition hover:border-accent/40"
						>
							<div class="aspect-[3/4] overflow-hidden bg-bg">
								{#if chapter.manga.thumbnailUrl}
									<img
										src={apiUrl(chapter.manga.thumbnailUrl)}
										alt={chapter.manga.title}
										class="h-full w-full object-cover"
										loading="lazy"
									/>
								{/if}
							</div>
							<div class="p-2">
								<p class="line-clamp-1 text-xs font-medium">{chapter.manga.title}</p>
								<p class="line-clamp-1 text-[11px] text-muted">{chapter.name}</p>
							</div>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if sources.length === 0}
		<div class="rounded-xl border border-border bg-surface p-8 text-center">
			<p class="text-muted">Belum ada source terinstall.</p>
			<a href="/extensions" class="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover">
				Buka Extensions
			</a>
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each sources as source}
				<a
					href="/browse/{source.id}"
					class="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition hover:border-accent/40 hover:bg-surface-hover"
				>
					<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-bg">
						{#if source.iconUrl}
							<img src={apiUrl(source.iconUrl)} alt="" class="h-full w-full object-cover" />
						{/if}
					</div>
					<div>
						<h2 class="font-medium">{source.name}</h2>
						<p class="text-sm text-muted">{source.lang}</p>
					</div>
				</a>
			{/each}
		</div>
		{/if}
	{/if}
</section>