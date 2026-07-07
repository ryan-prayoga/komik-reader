<script lang="ts">
	import { localData } from '$lib/local/data.svelte';
	import {
		formatDuration,
		formatDurationLong,
		getAllMangaStats,
		getGlobalStats
	} from '$lib/reading-time';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Card, EmptyState } from '$lib/components/ui';
	import Clock from '@lucide/svelte/icons/clock';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import LibraryBig from '@lucide/svelte/icons/library-big';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import { syncEngine } from '$lib/local/sync.svelte';

	// When logged in, fold in reading time from the user's other devices.
	const extra = $derived(syncEngine.loggedIn ? localData.otherMsByChapter : undefined);
	const global = $derived(getGlobalStats(localData.history, extra));
	const mangaList = $derived(getAllMangaStats(localData.history, extra));
	const hasAny = $derived(mangaList.length > 0);
	const completedShare = $derived(
		global.totalMs > 0 ? Math.round((global.completedMs / global.totalMs) * 100) : 0
	);
</script>

<section class="max-w-3xl">
	<PageHeader
		title="Statistik Baca"
		subtitle={syncEngine.loggedIn
			? 'Total waktu bacamu dari semua perangkat yang login ke akun ini.'
			: 'Berapa lama kamu sudah membaca komik di perangkat ini.'}
	>
		{#if syncEngine.loggedIn}
			<span class="inline-flex items-center gap-1 text-xs text-muted">
				<BookOpen size={13} /> Disinkronkan ke akun — gabungan semua perangkat.
			</span>
		{:else}
			<span class="text-xs text-muted">Perangkat ini saja — login untuk sinkronkan lintas perangkat.</span>
		{/if}
	</PageHeader>

	{#if !hasAny}
		<EmptyState
			title="Belum ada data baca"
			description="Mulai baca chapter di reader untuk mulai mencatat durasi."
		>
			{#snippet icon()}<Clock size={32} />{/snippet}
		</EmptyState>
	{:else}
		<!-- Big totals -->
		<div class="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
			<Card padding="lg">
				<div class="flex items-start gap-3">
					<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
						<Clock size={20} />
					</span>
					<div class="min-w-0">
						<p class="text-2xl font-bold tabular-nums text-text">
							{formatDuration(global.totalMs)}
						</p>
						<p class="text-xs text-muted">Total waktu baca · {formatDurationLong(global.totalMs)}</p>
					</div>
				</div>
			</Card>
			<Card padding="lg">
				<div class="flex items-start gap-3">
					<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
						<BookOpen size={20} />
					</span>
					<div class="min-w-0">
						<p class="text-2xl font-bold tabular-nums text-text">{global.chapterCount}</p>
						<p class="text-xs text-muted">Chapter dibuka (termasuk yang belum selesai)</p>
					</div>
				</div>
			</Card>
			<Card padding="lg">
				<div class="flex items-start gap-3">
					<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
						<LibraryBig size={20} />
					</span>
					<div class="min-w-0">
						<p class="text-2xl font-bold tabular-nums text-text">{global.mangaCount}</p>
						<p class="text-xs text-muted">Manga unik pernah dibuka</p>
					</div>
				</div>
			</Card>
		</div>

		{#if completedShare > 0}
			<Card padding="lg" class="mb-6">
				<div class="flex items-center justify-between gap-3 text-sm">
					<div class="flex items-center gap-2 text-text">
						<CheckCircle size={16} class="text-success" />
						<span>{completedShare}% waktu kamu habiskan untuk chapter yang ditandai selesai</span>
					</div>
					<span class="shrink-0 tabular-nums text-xs text-muted">
						{formatDuration(global.completedMs)} / {formatDuration(global.totalMs)}
					</span>
				</div>
				<div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
					<div
						class="h-full bg-success transition-[width] duration-300"
						style="width: {completedShare}%"
					></div>
				</div>
			</Card>
		{/if}

		<Card padding="none">
			<div class="flex items-center justify-between px-4 py-3">
				<h2 class="text-sm font-semibold text-text">Per manga</h2>
				<span class="text-xs text-muted">Urut: terlama dibaca</span>
			</div>
			<div class="divide-y divide-border">
				{#each mangaList as m (m.mangaId)}
					{@const perChapter = m.totalMs / m.chapterCount}
					<a
						href="/manga/{m.mangaId}"
						class="flex items-center gap-4 px-4 py-3 transition hover:bg-bg/60"
					>
						<div class="h-14 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-bg">
							{#if m.thumbnailUrl}
								<img src={m.thumbnailUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-text">{m.mangaTitle}</p>
							<p class="text-xs text-muted">
								{m.chapterCount} chapter · rata-rata {formatDuration(perChapter)}/chapter
							</p>
						</div>
						<div class="shrink-0 text-right">
							<p class="text-sm font-semibold tabular-nums text-text">{formatDuration(m.totalMs)}</p>
							<p class="text-[11px] text-muted">total</p>
						</div>
					</a>
				{/each}
			</div>
		</Card>
	{/if}
</section>