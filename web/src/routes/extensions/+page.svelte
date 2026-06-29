<script lang="ts">
	import { onMount } from 'svelte';
	import ExtensionCard from '$lib/components/ExtensionCard.svelte';
	import { fetchExtensionsCatalog, getExtensions } from '$lib/graphql/api';
	import { preferences } from '$lib/preferences.svelte';
	import type { Extension } from '$lib/graphql/types';

	let extensions = $state<Extension[]>([]);
	let loading = $state(true);
	let syncing = $state(false);
	let error = $state('');

	let search = $state('');
	let lang = $state('all');
	let status = $state<'all' | 'installed' | 'available' | 'update'>('all');
	async function load() {
		loading = true;
		error = '';
		try {
			extensions = await getExtensions(preferences.nsfwFilter);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat extensions';
		} finally {
			loading = false;
		}
	}

	async function syncCatalog() {
		syncing = true;
		error = '';
		try {
			await fetchExtensionsCatalog();
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal sync katalog';
		} finally {
			syncing = false;
		}
	}

	onMount(load);

	const langs = $derived(
		['all', ...new Set(extensions.map((e) => e.lang))].sort((a, b) => {
			if (a === 'all') return -1;
			if (b === 'all') return 1;
			if (a === 'id') return -1;
			if (b === 'id') return 1;
			return a.localeCompare(b);
		})
	);

	const filtered = $derived(
		extensions.filter((ext) => {
			if (lang !== 'all' && ext.lang !== lang) return false;
			if (status === 'installed' && !ext.isInstalled) return false;
			if (status === 'available' && ext.isInstalled) return false;
			if (status === 'update' && !ext.hasUpdate) return false;
			if (!preferences.showNsfw && ext.isNsfw) return false;
			if (search && !ext.name.toLowerCase().includes(search.toLowerCase())) return false;
			return true;
		})
	);
</script>

<section>
	<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold">Extensions</h1>
			<p class="mt-1 text-sm text-muted">
				Repo default: Keiyoushi — pilih manual extension yang mau di-install.
			</p>
		</div>
		<button
			class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
			disabled={syncing}
			onclick={syncCatalog}
		>
			{syncing ? 'Syncing...' : 'Refresh Catalog'}
		</button>
	</div>

	<div class="mb-4 flex flex-wrap gap-3">
		<input
			type="search"
			placeholder="Cari extension..."
			bind:value={search}
			class="min-w-[200px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
		/>
		<select
			bind:value={lang}
			class="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
		>
			{#each langs as l}
				<option value={l}>{l === 'all' ? 'Semua bahasa' : l}</option>
			{/each}
		</select>
		<select
			bind:value={status}
			class="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
		>
			<option value="all">Semua status</option>
			<option value="installed">Installed</option>
			<option value="available">Belum install</option>
			<option value="update">Ada update</option>
		</select>
		<label class="flex items-center gap-2 text-sm text-muted">
			<input
				type="checkbox"
				class="accent-accent"
				checked={preferences.showNsfw}
				onchange={(e) => {
					preferences.setShowNsfw(e.currentTarget.checked);
					load();
				}}
			/>
			Tampilkan NSFW
		</label>
	</div>

	{#if error}
		<div class="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<p class="text-muted">Memuat extensions...</p>
	{:else if filtered.length === 0}
		<p class="text-muted">Tidak ada extension. Coba Refresh Catalog.</p>
	{:else}
		<p class="mb-3 text-sm text-muted">{filtered.length} extension</p>
		<div class="space-y-3">
			{#each filtered as ext (ext.pkgName)}
				<ExtensionCard extension={ext} onchange={load} />
			{/each}
		</div>
	{/if}
</section>