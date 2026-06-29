<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import {
		clearServerImageCache,
		getAboutServer,
		getSettings,
		updateSettings
	} from '$lib/graphql/api';
	import type { AboutServer, ServerSettings } from '$lib/graphql/types';

	let { data, form } = $props();

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

{#if form?.success}
	<div class="mb-4 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
		{form.success}
	</div>
{/if}
{#if form?.error}
	<div class="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
		{form.error}
	</div>
{/if}
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

<div class="space-y-6">
	<section class="rounded-xl border border-border bg-surface p-5">
		<h2 class="mb-4 text-lg font-medium">Auth & Registrasi</h2>
		<form method="POST" action="?/auth" use:enhance class="space-y-4">
			<label class="flex items-center justify-between gap-4">
				<div>
					<p class="text-sm font-medium">Izinkan registrasi publik</p>
					<p class="text-xs text-muted">User bisa daftar sendiri di /register.</p>
				</div>
				<input
					name="allow_registration"
					type="checkbox"
					class="accent-accent"
					checked={data.allowRegistration}
				/>
			</label>
			<button
				type="submit"
				class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
			>
				Simpan
			</button>
		</form>
	</section>

	<section class="rounded-xl border border-border bg-surface p-5">
		<h2 class="mb-1 text-lg font-medium">SMTP (Lupa Password)</h2>
		<p class="mb-4 text-sm text-muted">
			Status: {data.smtpReady ? 'Siap kirim email' : 'Belum dikonfigurasi'}
		</p>
		<form method="POST" action="?/smtp" use:enhance class="grid gap-4 sm:grid-cols-2">
			<label class="block sm:col-span-2">
				<span class="text-sm text-muted">Host</span>
				<input
					name="host"
					type="text"
					required
					value={data.smtp.host}
					placeholder="smtp.gmail.com"
					class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
				/>
			</label>
			<label class="block">
				<span class="text-sm text-muted">Port</span>
				<input
					name="port"
					type="number"
					required
					value={data.smtp.port}
					class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
				/>
			</label>
			<label class="flex items-end gap-2 pb-2">
				<input name="secure" type="checkbox" class="accent-accent" checked={data.smtp.secure} />
				<span class="text-sm">SSL/TLS (port 465)</span>
			</label>
			<label class="block">
				<span class="text-sm text-muted">User</span>
				<input
					name="user"
					type="text"
					required
					value={data.smtp.user}
					class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
				/>
			</label>
			<label class="block">
				<span class="text-sm text-muted">
					Password {data.smtp.passConfigured ? '(kosongkan jika tidak diubah)' : ''}
				</span>
				<input
					name="pass"
					type="password"
					autocomplete="new-password"
					placeholder={data.smtp.passConfigured ? '••••••••' : ''}
					class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
				/>
			</label>
			<label class="block sm:col-span-2">
				<span class="text-sm text-muted">From</span>
				<input
					name="from"
					type="text"
					value={data.smtp.from}
					placeholder="Komik Reader <noreply@domain.com>"
					class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
				/>
			</label>
			<div class="sm:col-span-2">
				<button
					type="submit"
					class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
				>
					Simpan SMTP
				</button>
			</div>
		</form>
	</section>

	{#if loading}
		<p class="text-muted">Memuat Suwayomi...</p>
	{:else}
		{#if server}
			<section class="rounded-xl border border-border bg-surface p-5">
				<h2 class="mb-4 text-lg font-medium">Suwayomi Server</h2>
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
			</section>
		{/if}

		{#if settings}
			<section class="rounded-xl border border-border bg-surface p-5">
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
						{saving ? 'Menyimpan...' : 'Simpan pengaturan Suwayomi'}
					</button>
				</div>
			</section>

			<section class="rounded-xl border border-border bg-surface p-5">
				<h2 class="mb-2 text-lg font-medium">Extension Repos</h2>
				<ul class="space-y-1 text-xs text-muted">
					{#each settings.extensionRepos as repo}
						<li class="break-all">{repo}</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="rounded-xl border border-border bg-surface p-5">
			<h2 class="mb-2 text-lg font-medium">Maintenance</h2>
			<p class="mb-4 text-sm text-muted">Bersihkan cache gambar di server Suwayomi.</p>
			<button
				class="rounded-lg border border-border px-4 py-2 text-sm hover:border-danger hover:text-danger disabled:opacity-50"
				disabled={clearing}
				onclick={clearCache}
			>
				{clearing ? 'Membersihkan...' : 'Bersihkan cache server'}
			</button>
		</section>
	{/if}
</div>