<script lang="ts">
	import { onMount } from 'svelte';
	import { getInstalledSources } from '$lib/graphql/api';
	import type { Source } from '$lib/graphql/types';
	import { apiUrl } from '$lib/graphql/client';

	let sources = $state<Source[]>([]);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			sources = await getInstalledSources(false);
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
	{:else if sources.length === 0}
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
</section>