<script lang="ts">
	import { onMount } from 'svelte';
	import {
		clearServerImageCache,
		getAboutServer,
		getSettings,
		updateSettings
	} from '$lib/graphql/api';
	import { preferences } from '$lib/preferences.svelte';
	import type { AboutServer, ServerSettings } from '$lib/graphql/types';

	let server = $state<AboutServer | null>(null);
	let settings = $state<ServerSettings | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let clearing = $state(false);
	let notice = $state('');
	let error = $state('');

	onMount(async () => {
		try {
			const [about, cfg] = await Promise.all([getAboutServer(), getSettings()]);
			server = about;
			settings = cfg;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat settings';
		} finally {
			loading = false;
		}
	});

	async function saveServerSettings() {
		if (!settings) return;
		saving = true;
		notice = '';
		error = '';
		try {
			settings = await updateSettings({
				autoDownloadNewChapters: settings.autoDownloadNewChapters,
				autoDownloadNewChaptersLimit: settings.autoDownloadNewChaptersLimit,
				updateMangas: settings.updateMangas,
				globalUpdateInterval: settings.globalUpdateInterval
			});
			notice = 'Pengaturan server disimpan.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menyimpan';
		} finally {
			saving = false;
		}
	}

	async function clearCache() {
		clearing = true;
		error = '';
		try {
			await clearServerImageCache();
			notice = 'Cache gambar server dibersihkan.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal bersihkan cache';
		} finally {
			clearing = false;
		}
	}
</script>

<section class="max-w-2xl">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold">Settings</h1>
		<p class="mt-1 text-sm text-muted">Preferensi aplikasi dan konfigurasi Suwayomi.</p>
	</div>

	{#if notice}
		<div class="mb-4 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
			{notice}
		</div>
	{/if}
	{#if error}
		<div class="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
			{error}
		</div>
	{/if}

	{#if loading}
		<p class="text-muted">Memuat...</p>
	{:else}
		<div class="space-y-6">
			<div class="rounded-xl border border-border bg-surface p-5">
				<h2 class="mb-4 text-lg font-medium">Aplikasi</h2>
				<label class="flex items-center justify-between gap-4">
					<div>
						<p class="text-sm font-medium">Tampilkan konten NSFW</p>
						<p class="text-xs text-muted">Extension dan source bertanda NSFW akan ditampilkan.</p>
					</div>
					<input
						type="checkbox"
						class="accent-accent"
						checked={preferences.showNsfw}
						onchange={(e) => preferences.setShowNsfw(e.currentTarget.checked)}
					/>
				</label>
			</div>

			{#if server}
				<div class="rounded-xl border border-border bg-surface p-5">
					<h2 class="mb-4 text-lg font-medium">Server</h2>
					<dl class="space-y-2 text-sm">
						<div class="flex justify-between gap-4">
							<dt class="text-muted">Nama</dt>
							<dd>{server.name}</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-muted">Versi</dt>
							<dd>{server.version} ({server.revision})</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-muted">Build</dt>
							<dd>{server.buildType}</dd>
						</div>
					</dl>
				</div>
			{/if}

			{#if settings}
				<div class="rounded-xl border border-border bg-surface p-5">
					<h2 class="mb-4 text-lg font-medium">Download & Update</h2>
					<div class="space-y-4">
						<label class="flex items-center justify-between gap-4">
							<span class="text-sm">Auto-download chapter baru</span>
							<input
								type="checkbox"
								class="accent-accent"
								bind:checked={settings.autoDownloadNewChapters}
							/>
						</label>
						<label class="flex items-center justify-between gap-4">
							<span class="text-sm">Limit auto-download</span>
							<input
								type="number"
								min="0"
								max="50"
								bind:value={settings.autoDownloadNewChaptersLimit}
								class="w-20 rounded-lg border border-border bg-bg px-2 py-1 text-sm"
							/>
						</label>
						<label class="flex items-center justify-between gap-4">
							<span class="text-sm">Auto-update library</span>
							<input type="checkbox" class="accent-accent" bind:checked={settings.updateMangas} />
						</label>
						<label class="flex items-center justify-between gap-4">
							<span class="text-sm">Interval update (jam)</span>
							<input
								type="number"
								min="1"
								max="168"
								step="0.5"
								bind:value={settings.globalUpdateInterval}
								class="w-20 rounded-lg border border-border bg-bg px-2 py-1 text-sm"
							/>
						</label>
						{#if settings.downloadsPath}
							<p class="text-xs text-muted">Folder download: {settings.downloadsPath}</p>
						{/if}
						<button
							class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
							disabled={saving}
							onclick={saveServerSettings}
						>
							{saving ? 'Menyimpan...' : 'Simpan pengaturan server'}
						</button>
					</div>
				</div>

				<div class="rounded-xl border border-border bg-surface p-5">
					<h2 class="mb-2 text-lg font-medium">Extension Repos</h2>
					<ul class="space-y-1 text-xs text-muted">
						{#each settings.extensionRepos as repo}
							<li class="break-all">{repo}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<div class="rounded-xl border border-border bg-surface p-5">
				<h2 class="mb-2 text-lg font-medium">Maintenance</h2>
				<p class="mb-4 text-sm text-muted">
					Bersihkan cache gambar di server Suwayomi (bukan cache offline perangkat).
				</p>
				<button
					class="rounded-lg border border-border px-4 py-2 text-sm hover:border-danger hover:text-danger disabled:opacity-50"
					disabled={clearing}
					onclick={clearCache}
				>
					{clearing ? 'Membersihkan...' : 'Bersihkan cache server'}
				</button>
			</div>
		</div>
	{/if}
</section>