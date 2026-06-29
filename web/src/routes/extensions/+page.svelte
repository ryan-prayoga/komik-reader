<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import ExtensionCard from '$lib/components/ExtensionCard.svelte';
	import { fetchExtensionsCatalog, getExtensions } from '$lib/graphql/api';
	import { preferences } from '$lib/preferences.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import LoginGate from '$lib/components/LoginGate.svelte';
	import { Button, Select, Switch, EmptyState, Spinner } from '$lib/components/ui';
	import Search from '@lucide/svelte/icons/search';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import type { Extension } from '$lib/graphql/types';

	const guest = $derived(!$page.data.user && $page.data.authEnabled);

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

	onMount(() => {
		if (guest) {
			loading = false;
			return;
		}
		load();
	});

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
	<PageHeader title="Extensions" subtitle="Repo default: Keiyoushi — pilih extension untuk di-install.">
		{#if !guest}
			<Button variant="secondary" size="sm" loading={syncing} onclick={syncCatalog}>
				<RefreshCw size={15} /> Refresh
			</Button>
		{/if}
	</PageHeader>

	{#if guest}
		<LoginGate description="Masuk untuk mengelola extension/source. Browse dan baca tetap bebas." />
	{:else}
	<div class="mb-5 flex flex-wrap items-end gap-3">
		<div class="relative min-w-[200px] flex-1">
			<Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
			<input
				type="search"
				placeholder="Cari extension..."
				bind:value={search}
				class="w-full rounded-[var(--radius)] border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus:border-accent"
			/>
		</div>
		<Select bind:value={lang} class="w-36">
			{#each langs as l}
				<option value={l}>{l === 'all' ? 'Semua bahasa' : l}</option>
			{/each}
		</Select>
		<Select bind:value={status} class="w-40">
			<option value="all">Semua status</option>
			<option value="installed">Installed</option>
			<option value="available">Belum install</option>
			<option value="update">Ada update</option>
		</Select>
	</div>

	<div class="mb-5">
		<Switch
			label="Tampilkan NSFW"
			checked={preferences.showNsfw}
			onchange={(v) => {
				preferences.setShowNsfw(v);
				load();
			}}
		/>
	</div>

	{#if error}
		<div class="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="flex justify-center py-16 text-muted"><Spinner size={26} /></div>
	{:else if filtered.length === 0}
		<EmptyState title="Tidak ada extension" description="Coba ubah filter atau Refresh katalog." />
	{:else}
		<p class="mb-3 text-sm text-muted">{filtered.length} extension</p>
		<div class="space-y-3">
			{#each filtered as ext (ext.pkgName)}
				<ExtensionCard extension={ext} onchange={load} />
			{/each}
		</div>
	{/if}
	{/if}
</section>
