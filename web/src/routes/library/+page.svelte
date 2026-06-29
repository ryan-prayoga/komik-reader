<script lang="ts">
	import { page } from '$app/stores';
	import MangaCard from '$lib/components/MangaCard.svelte';
	import { apiUrl } from '$lib/graphql/client';
	import { getCategories, getLibraryManga, getRecentlyReadChapters } from '$lib/graphql/api';
	import { continueReadingLabel, continueReadingUrl } from '$lib/library';
	import type { Category, LibraryManga, RecentChapter } from '$lib/graphql/types';

	type Tab = 'all' | 'unread';

	let tab = $state<Tab>('all');
	let mangas = $state<LibraryManga[]>([]);
	let recent = $state<RecentChapter[]>([]);
	let categories = $state<Category[]>([]);
	let loading = $state(true);
	let error = $state('');

	const categoryId = $derived(
		$page.url.searchParams.get('category')
			? Number($page.url.searchParams.get('category'))
			: undefined
	);

	const filtered = $derived(
		tab === 'unread' ? mangas.filter((m) => m.unreadCount > 0) : mangas
	);

	$effect(() => {
		const id = categoryId;
		let cancelled = false;
		loading = true;
		error = '';

		Promise.all([
			getLibraryManga(id),
			getRecentlyReadChapters(8),
			getCategories()
		])
			.then(([library, chapters, cats]) => {
				if (cancelled) return;
				mangas = library;
				recent = chapters;
				categories = cats;
			})
			.catch((e) => {
				if (cancelled) return;
				error = e instanceof Error ? e.message : 'Gagal memuat library';
			})
			.finally(() => {
				if (!cancelled) loading = false;
			});

		return () => {
			cancelled = true;
		};
	});
</script>

<section>
	<div class="mb-6">
		<h1 class="text-2xl font-semibold">Library</h1>
		<p class="mt-1 text-sm text-muted">
			Koleksi manga favoritmu. Tambahkan dari halaman detail manga.
		</p>
	</div>

	{#if error}
		<div class="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<p class="text-muted">Memuat...</p>
	{:else}
		{#if recent.length > 0}
			<div class="mb-8">
				<h2 class="mb-3 text-lg font-medium">Lanjut Baca</h2>
				<div class="flex gap-4 overflow-x-auto pb-2">
					{#each recent as chapter (chapter.id)}
						<a
							href="/read/{chapter.id}"
							class="w-36 shrink-0 overflow-hidden rounded-xl border border-border bg-surface transition hover:border-accent/40"
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

		{#if categories.length > 0}
			<div class="mb-4 flex flex-wrap gap-2">
				<a
					href="/library"
					class="rounded-full border px-3 py-1 text-xs transition {!categoryId
						? 'border-accent bg-accent/15 text-accent'
						: 'border-border text-muted hover:border-accent'}"
				>
					Semua kategori
				</a>
				{#each categories as category (category.id)}
					<a
						href="/library?category={category.id}"
						class="rounded-full border px-3 py-1 text-xs transition {categoryId ===
						category.id
							? 'border-accent bg-accent/15 text-accent'
							: 'border-border text-muted hover:border-accent'}"
					>
						{category.name}
					</a>
				{/each}
			</div>
		{/if}

		<div class="mb-4 flex gap-2">
			<button
				class="rounded-lg px-4 py-2 text-sm transition {tab === 'all'
					? 'bg-accent text-white'
					: 'border border-border text-muted hover:border-accent'}"
				onclick={() => (tab = 'all')}
			>
				Semua ({mangas.length})
			</button>
			<button
				class="rounded-lg px-4 py-2 text-sm transition {tab === 'unread'
					? 'bg-accent text-white'
					: 'border border-border text-muted hover:border-accent'}"
				onclick={() => (tab = 'unread')}
			>
				Belum dibaca ({mangas.filter((m) => m.unreadCount > 0).length})
			</button>
		</div>

		{#if filtered.length === 0}
			<div class="rounded-xl border border-border bg-surface p-8 text-center">
				<p class="text-muted">
					{tab === 'unread' ? 'Semua chapter sudah dibaca.' : 'Library masih kosong.'}
				</p>
				{#if tab === 'all'}
					<p class="mt-2 text-sm text-muted">
						Browse komik lalu tap <strong>+ Library</strong> di halaman detail.
					</p>
				{/if}
			</div>
		{:else}
			<div class="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
				{#each filtered as manga (manga.id)}
					<div class="relative">
						<MangaCard manga={manga} href="/manga/{manga.id}" />
						{#if manga.unreadCount > 0}
							<span
								class="absolute right-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-white"
							>
								{manga.unreadCount}
							</span>
						{/if}
						<a
							href={continueReadingUrl(manga)}
							class="mt-2 block rounded-lg border border-border bg-surface px-3 py-2 text-center text-xs transition hover:border-accent"
						>
							Lanjut: {continueReadingLabel(manga)}
						</a>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</section>