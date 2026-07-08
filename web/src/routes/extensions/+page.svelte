<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import ExtensionCard from '$lib/components/ExtensionCard.svelte';
	import { fetchExtensionsCatalog, getExtensions } from '$lib/graphql/api';
	import { preferences } from '$lib/preferences.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import { Button, Select, EmptyState, Spinner, ViewToggle } from '$lib/components/ui';
	import Search from '@lucide/svelte/icons/search';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Check from '@lucide/svelte/icons/check';
	import type { Extension } from '$lib/graphql/types';

	const LANG_META: Record<string, { flag: string; name: string }> = {
		all:      { flag: '🌐', name: 'Multi-bahasa' },
		id:       { flag: '🇮🇩', name: 'Indonesia' },
		en:       { flag: '🇬🇧', name: 'English' },
		ja:       { flag: '🇯🇵', name: '日本語' },
		zh:       { flag: '🇨🇳', name: '中文' },
		'zh-Hans':{ flag: '🇨🇳', name: 'Mandarin Sederhana' },
		'zh-Hant':{ flag: '🇹🇼', name: 'Mandarin Tradisional' },
		ko:       { flag: '🇰🇷', name: '한국어' },
		ar:       { flag: '🇸🇦', name: 'العربية' },
		de:       { flag: '🇩🇪', name: 'Deutsch' },
		es:       { flag: '🇪🇸', name: 'Español' },
		fr:       { flag: '🇫🇷', name: 'Français' },
		it:       { flag: '🇮🇹', name: 'Italiano' },
		pt:       { flag: '🇵🇹', name: 'Português' },
		'pt-BR':  { flag: '🇧🇷', name: 'Português (Brasil)' },
		ru:       { flag: '🇷🇺', name: 'Русский' },
		tr:       { flag: '🇹🇷', name: 'Türkçe' },
		pl:       { flag: '🇵🇱', name: 'Polski' },
		vi:       { flag: '🇻🇳', name: 'Tiếng Việt' },
		th:       { flag: '🇹🇭', name: 'ภาษาไทย' },
		bg:       { flag: '🇧🇬', name: 'Български' },
		ca:       { flag: '🏳️', name: 'Català' },
		cs:       { flag: '🇨🇿', name: 'Čeština' },
		nl:       { flag: '🇳🇱', name: 'Nederlands' },
		ro:       { flag: '🇷🇴', name: 'Română' },
		uk:       { flag: '🇺🇦', name: 'Українська' },
		hu:       { flag: '🇭🇺', name: 'Magyar' },
		ms:       { flag: '🇲🇾', name: 'Bahasa Melayu' },
		fil:      { flag: '🇵🇭', name: 'Filipino' },
	};

	function langFlag(code: string): string {
		return LANG_META[code]?.flag ?? '🏳️';
	}
	function langName(code: string): string {
		return LANG_META[code]?.name ?? code;
	}

	let { data } = $props();

	const admin = $derived(!!$page.data.user?.is_admin);

	let extensions = $state<Extension[]>([]);
	let loading = $state(true);
	let syncing = $state(false);
	let error = $state('');
	let search = $state('');

	let viewMode = $state<'list' | 'grid'>(preferences.extViewMode);
	$effect(() => { preferences.setExtViewMode(viewMode); });

	// Persisted filters
	let selectedLangs = $state<string[]>(preferences.extFilterLangs);
	let status = $state(preferences.extFilterStatus);
	let onlyActive = $state(preferences.extFilterOnlyActive);

	$effect(() => { preferences.setExtFilterLangs(selectedLangs); });
	$effect(() => { preferences.setExtFilterStatus(status); });
	$effect(() => { preferences.setExtFilterOnlyActive(onlyActive); });

	function toggleLang(lang: string) {
		if (selectedLangs.includes(lang)) {
			selectedLangs = selectedLangs.filter((l) => l !== lang);
		} else {
			selectedLangs = [...selectedLangs, lang];
		}
	}

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
		load();
	});

	const allLangs = $derived(
		[...new Set(extensions.map((e) => e.lang))].sort((a, b) => {
			if (a === 'id') return -1;
			if (b === 'id') return 1;
			return a.localeCompare(b);
		})
	);

	const langLabel = $derived(
		selectedLangs.length === 0
			? 'Semua bahasa'
			: selectedLangs.length === 1
				? `${langFlag(selectedLangs[0])} ${langName(selectedLangs[0])}`
				: selectedLangs.length === 2
					? `${langFlag(selectedLangs[0])} ${selectedLangs[0]}, ${langFlag(selectedLangs[1])} ${selectedLangs[1]}`
					: `${selectedLangs.map(langFlag).join('')} ${selectedLangs.length} bahasa`
	);

	const filtered = $derived(
		extensions.filter((ext) => {
			if (selectedLangs.length > 0 && !selectedLangs.includes(ext.lang)) return false;
			// Admin status filter
			if (admin) {
				if (status === 'installed' && !ext.isInstalled) return false;
				if (status === 'available' && ext.isInstalled) return false;
				if (status === 'update' && !ext.hasUpdate) return false;
			} else {
				// Non-admin: optional "aktif saja" chip
				if (onlyActive && !preferences.isExtensionActive(ext.pkgName)) return false;
			}
			if (!preferences.showNsfw && ext.isNsfw) return false;
			if (search && !ext.name.toLowerCase().includes(search.toLowerCase())) return false;
			return true;
		})
	);
</script>

<section>
	<PageHeader
		title="Extensions"
		subtitle={admin
			? 'Kelola extension — install, update, dan lihat popularitas.'
			: 'Aktifkan extension untuk mulai browse komik.'}
	>
		{#if admin}
			<Button variant="secondary" size="sm" loading={syncing} onclick={syncCatalog}>
				<RefreshCw size={15} /> Refresh
			</Button>
		{/if}
	</PageHeader>

	<div class="mb-5 flex flex-wrap items-center gap-3">
		<!-- Search -->
		<div class="relative min-w-[200px] flex-1">
			<Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
			<input
				type="search"
				placeholder="Cari extension..."
				bind:value={search}
				class="w-full rounded-[var(--radius)] border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text outline-none transition placeholder:text-muted focus:border-accent"
			/>
		</div>

		<!-- Language multi-select -->
		<Dropdown align="left">
			{#snippet trigger({ open, toggle })}
				<button
					type="button"
					onclick={toggle}
					class="flex items-center gap-2 rounded-[var(--radius)] border px-3 py-2 text-sm transition
						{selectedLangs.length > 0
						? 'border-accent bg-accent/10 text-accent'
						: 'border-border bg-surface text-text hover:bg-surface-hover'}"
				>
					{langLabel}
					<ChevronDown size={14} class="text-muted transition {open ? 'rotate-180' : ''}" />
				</button>
			{/snippet}
			{#snippet children({ close: _close })}
				<div class="max-h-72 overflow-y-auto">
					<!-- Reset -->
					<button
						type="button"
						onclick={() => (selectedLangs = [])}
						class="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm transition hover:bg-surface-hover
							{selectedLangs.length === 0 ? 'font-medium text-accent' : 'text-text'}"
					>
						<span class="flex w-4 shrink-0 items-center justify-center">
							{#if selectedLangs.length === 0}<Check size={13} class="text-accent" />{/if}
						</span>
						<span>🌐</span>
						Semua bahasa
					</button>
					<div class="my-1 h-px bg-border"></div>
					{#each allLangs as lang}
						{@const active = selectedLangs.includes(lang)}
						<button
							type="button"
							onclick={() => toggleLang(lang)}
							class="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm transition hover:bg-surface-hover"
						>
							<span class="flex w-4 shrink-0 items-center justify-center">
								{#if active}<Check size={13} class="text-accent" />{/if}
							</span>
							<span class="shrink-0">{langFlag(lang)}</span>
							<span class={active ? 'font-medium text-accent' : 'text-text'}>
								{langName(lang)}
							</span>
							<span class="ml-auto text-xs text-muted">{lang}</span>
						</button>
					{/each}
				</div>
			{/snippet}
		</Dropdown>

		<!-- View mode toggle -->
		<ViewToggle bind:value={viewMode} />

		<!-- Admin: status select | Non-admin: "Aktif saja" chip -->
		{#if admin}
			<Select bind:value={status} class="w-40">
				<option value="all">Semua status</option>
				<option value="installed">Installed</option>
				<option value="available">Belum install</option>
				<option value="update">Ada update</option>
			</Select>
		{:else}
			<button
				type="button"
				onclick={() => (onlyActive = !onlyActive)}
				class="flex items-center gap-1.5 rounded-[var(--radius)] border px-3 py-2 text-sm transition
					{onlyActive
					? 'border-accent bg-accent/10 font-medium text-accent'
					: 'border-border bg-surface text-muted hover:bg-surface-hover hover:text-text'}"
			>
				{#if onlyActive}<Check size={13} />{/if}
				Aktif saja
			</button>
		{/if}

		<!-- NSFW chip -->
		<button
			type="button"
			onclick={() => { preferences.setShowNsfw(!preferences.showNsfw); load(); }}
			class="flex items-center gap-1.5 rounded-[var(--radius)] border px-3 py-2 text-sm transition
				{preferences.showNsfw
				? 'border-danger bg-danger/10 font-medium text-danger'
				: 'border-border bg-surface text-muted hover:bg-surface-hover hover:text-text'}"
		>
			{#if preferences.showNsfw}<Check size={13} />{/if}
			NSFW
		</button>
	</div>

	{#if error}
		<div class="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="flex justify-center py-16 text-muted"><Spinner size={26} /></div>
	{:else if filtered.length === 0}
		<EmptyState title="Tidak ada extension" description="Coba ubah filter." />
	{:else}
		<p class="mb-3 text-sm text-muted">{filtered.length} extension</p>
		{#if viewMode === 'grid'}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{#each filtered as ext (ext.pkgName)}
					<ExtensionCard
						extension={ext}
						{admin}
						activationCount={data.activationCounts[ext.pkgName]}
						onchange={load}
						compact
					/>
				{/each}
			</div>
		{:else}
			<div class="space-y-3">
				{#each filtered as ext (ext.pkgName)}
					<ExtensionCard
						extension={ext}
						{admin}
						activationCount={data.activationCounts[ext.pkgName]}
						onchange={load}
					/>
				{/each}
			</div>
		{/if}
	{/if}
</section>
