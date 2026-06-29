<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import {
		clearServerImageCache,
		getAboutServer,
		getSettings,
		updateSettings
	} from '$lib/graphql/api';
	import { Button, Card, Switch, Spinner } from '$lib/components/ui';
	import type { AboutServer, ServerSettings } from '$lib/graphql/types';

	let { data, form } = $props();

	let server = $state<AboutServer | null>(null);
	let settings = $state<ServerSettings | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let clearing = $state(false);
	let notice = $state('');
	let error = $state('');

	const numField =
		'w-24 rounded-[var(--radius)] border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent';

	onMount(async () => {
		try {
			const [about, cfg] = await Promise.all([getAboutServer(), getSettings()]);
			server = about;
			settings = cfg;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat settings Suwayomi';
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
			notice = 'Pengaturan Suwayomi disimpan.';
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

{#if form?.success || notice}
	<div class="mb-4 rounded-[var(--radius)] border border-success/30 bg-success/10 p-3 text-sm text-success">
		{form?.success || notice}
	</div>
{/if}
{#if error}
	<div class="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
		{error}
	</div>
{/if}

<div class="space-y-6">
	<Card padding="lg">
		<h2 class="mb-4 text-lg font-semibold text-text">Auth & Registrasi</h2>
		<form method="POST" action="?/auth" use:enhance class="space-y-4">
			<label class="flex items-center justify-between gap-4">
				<div>
					<p class="text-sm font-medium text-text">Izinkan registrasi publik</p>
					<p class="text-xs text-muted">User bisa daftar sendiri di /register.</p>
				</div>
				<input name="allow_registration" type="checkbox" class="h-5 w-5 accent-accent" checked={data.allowRegistration} />
			</label>
			<Button type="submit">Simpan</Button>
		</form>
	</Card>

	{#if loading}
		<div class="flex justify-center py-12 text-muted"><Spinner size={24} /></div>
	{:else}
		{#if server}
			<Card padding="lg">
				<h2 class="mb-4 text-lg font-semibold text-text">Suwayomi Server</h2>
				<dl class="space-y-2 text-sm">
					<div class="flex justify-between gap-4">
						<dt class="text-muted">Nama</dt>
						<dd class="text-text">{server.name}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt class="text-muted">Versi</dt>
						<dd class="text-text">{server.version} ({server.revision})</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt class="text-muted">Build</dt>
						<dd class="text-text">{server.buildType}</dd>
					</div>
				</dl>
			</Card>
		{/if}

		{#if settings}
			<Card padding="lg">
				<h2 class="mb-4 text-lg font-semibold text-text">Download & Update</h2>
				<div class="space-y-4">
					<Switch
						label="Auto-download chapter baru"
						checked={settings.autoDownloadNewChapters}
						onchange={(v) => settings && (settings.autoDownloadNewChapters = v)}
					/>
					<label class="flex items-center justify-between gap-4">
						<span class="text-sm text-text">Limit auto-download</span>
						<input type="number" min="0" max="50" bind:value={settings.autoDownloadNewChaptersLimit} class={numField} />
					</label>
					<Switch
						label="Auto-update library"
						checked={settings.updateMangas}
						onchange={(v) => settings && (settings.updateMangas = v)}
					/>
					<label class="flex items-center justify-between gap-4">
						<span class="text-sm text-text">Interval update (jam)</span>
						<input type="number" min="1" max="168" step="0.5" bind:value={settings.globalUpdateInterval} class={numField} />
					</label>
					{#if settings.downloadsPath}
						<p class="text-xs text-muted">Folder download: {settings.downloadsPath}</p>
					{/if}
					<Button loading={saving} onclick={saveServerSettings}>Simpan pengaturan Suwayomi</Button>
				</div>
			</Card>

			<Card padding="lg">
				<h2 class="mb-2 text-lg font-semibold text-text">Extension Repos</h2>
				<ul class="space-y-1 text-xs text-muted">
					{#each settings.extensionRepos as repo}
						<li class="break-all">{repo}</li>
					{/each}
				</ul>
			</Card>
		{/if}

		<Card padding="lg">
			<h2 class="mb-2 text-lg font-semibold text-text">Maintenance</h2>
			<p class="mb-4 text-sm text-muted">Bersihkan cache gambar di server Suwayomi.</p>
			<Button variant="secondary" loading={clearing} onclick={clearCache}>Bersihkan cache server</Button>
		</Card>
	{/if}
</div>
