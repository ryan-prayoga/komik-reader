<script lang="ts">
	import { onMount } from 'svelte';
	import { getInstalledSources } from '$lib/graphql/api';
	import { preferences } from '$lib/preferences.svelte';
	import { localData } from '$lib/local/data.svelte';
	import type { RecentChapter, Source } from '$lib/graphql/types';
	import { apiUrl } from '$lib/graphql/client';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ContinueReading from '$lib/components/ContinueReading.svelte';
	import { Button, Card, EmptyState, Spinner } from '$lib/components/ui';
	import Puzzle from '@lucide/svelte/icons/puzzle';
	import ServerCrash from '@lucide/svelte/icons/server-crash';

	let sources = $state<Source[]>([]);
	let loading = $state(true);
	let error = $state('');

	// Continue-reading from local history (works for everyone, no login).
	const recent = $derived(
		localData.history.slice(0, 6).map(
			(h): RecentChapter => ({
				id: h.chapterId,
				name: h.chapterName,
				mangaId: h.mangaId,
				lastPageRead: h.lastPage,
				lastReadAt: '',
				manga: { id: h.mangaId, title: h.mangaTitle, thumbnailUrl: h.thumbnailUrl }
			})
		)
	);

	onMount(async () => {
		try {
			sources = await getInstalledSources(preferences.nsfwFilter);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat source';
		} finally {
			loading = false;
		}
	});
</script>

<section>
	<PageHeader title="Beranda" subtitle="Lanjutkan bacaan dan jelajahi source terinstall.">
		<Button href="/extensions" variant="secondary" size="sm">
			<Puzzle size={15} /> Extensions
		</Button>
	</PageHeader>

	{#if loading}
		<div class="flex justify-center py-16 text-muted"><Spinner size={26} /></div>
	{:else if error}
		<Card class="border-danger/30 bg-danger/10">
			<div class="flex items-start gap-3">
				<ServerCrash size={20} class="mt-0.5 shrink-0 text-danger" />
				<div>
					<p class="font-medium text-danger">Suwayomi tidak terhubung</p>
					<p class="mt-1 text-sm text-muted">{error}</p>
					<p class="mt-2 text-sm text-muted">
						Jalankan <code class="rounded bg-surface-hover px-1.5 py-0.5">cd suwayomi && ./bootstrap.sh</code>
					</p>
				</div>
			</div>
		</Card>
	{:else}
		<ContinueReading chapters={recent} seeAllHref="/library" />

		<h2 class="mb-3 text-lg font-semibold text-text">Source Terinstall</h2>
		{#if sources.length === 0}
			<EmptyState
				title="Belum ada source"
				description="Install extension dulu untuk menampilkan source baca komik."
			>
				{#snippet icon()}<Puzzle size={32} />{/snippet}
				{#snippet action()}<Button href="/extensions">Buka Extensions</Button>{/snippet}
			</EmptyState>
		{:else}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each sources as source}
					<Card href="/browse/{source.id}" hover padding="sm">
						<div class="flex items-center gap-4">
							<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-bg">
								{#if source.iconUrl}
									<img src={apiUrl(source.iconUrl)} alt="" class="h-full w-full object-cover" />
								{/if}
							</div>
							<div class="min-w-0">
								<h3 class="truncate font-medium text-text">{source.name}</h3>
								<p class="text-sm text-muted">{source.lang}</p>
							</div>
						</div>
					</Card>
				{/each}
			</div>
		{/if}
	{/if}
</section>
