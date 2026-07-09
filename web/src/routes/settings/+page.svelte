<script lang="ts">
	import { preferences, type Theme } from '$lib/preferences.svelte';
	import { readerSettings, type ReaderMode } from '$lib/reader-settings.svelte';
	import { syncEngine } from '$lib/local/sync.svelte';
	import { localData } from '$lib/local/data.svelte';
	import { listOfflineChapters, removeOfflineChapter } from '$lib/offline/db';
	import { removeChapterFromDevice } from '$lib/offline/cache';
	import { showToast } from '$lib/stores/toast.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Card, Switch, Button, Modal } from '$lib/components/ui';
	import Cloud from '@lucide/svelte/icons/cloud';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Monitor from '@lucide/svelte/icons/monitor';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Columns2 from '@lucide/svelte/icons/columns-2';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Download from '@lucide/svelte/icons/download';
	import Upload from '@lucide/svelte/icons/upload';

	let confirmHistory = $state(false);
	let confirmDownloads = $state(false);
	let clearingDownloads = $state(false);
	let exporting = $state(false);
	let importing = $state(false);
	let importFileInput = $state<HTMLInputElement | null>(null);

	async function exportBackup() {
		exporting = true;
		try {
			const dump = await localData.exportData();
			const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			const date = new Date().toISOString().slice(0, 10);
			a.href = url;
			a.download = `komik-reader-backup-${date}.json`;
			a.click();
			URL.revokeObjectURL(url);
			showToast('Backup diunduh.', 'success');
		} catch {
			showToast('Gagal membuat backup.', 'error');
		} finally {
			exporting = false;
		}
	}

	function pickImportFile() {
		importFileInput?.click();
	}

	async function handleImportFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		(e.target as HTMLInputElement).value = '';
		if (!file) return;
		importing = true;
		try {
			const text = await file.text();
			const dump = JSON.parse(text);
			if (!dump || typeof dump !== 'object' || !Array.isArray(dump.history)) {
				throw new Error('Format file tidak valid');
			}
			await localData.importData(dump);
			showToast('Backup berhasil diimpor.', 'success');
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Gagal impor backup.', 'error');
		} finally {
			importing = false;
		}
	}

	async function clearHistory() {
		await localData.clearAllHistory();
		confirmHistory = false;
		showToast('Riwayat baca dihapus.', 'success');
	}

	async function clearDownloads() {
		clearingDownloads = true;
		try {
			const chapters = await listOfflineChapters();
			for (const c of chapters) {
				await removeChapterFromDevice(c.chapterId).catch(() => removeOfflineChapter(c.chapterId));
			}
			showToast(`${chapters.length} chapter offline dihapus.`, 'success');
		} finally {
			clearingDownloads = false;
			confirmDownloads = false;
		}
	}

	const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
		{ value: 'light', label: 'Terang', icon: Sun },
		{ value: 'system', label: 'Sistem', icon: Monitor },
		{ value: 'dark', label: 'Gelap', icon: Moon }
	];
	const modes: { value: ReaderMode; label: string; icon: typeof BookOpen }[] = [
		{ value: 'webtoon', label: 'Webtoon', icon: ScrollText },
		{ value: 'paged', label: 'Halaman', icon: BookOpen },
		{ value: 'double', label: 'Ganda', icon: Columns2 }
	];
</script>

<section class="max-w-2xl">
	<PageHeader title="Pengaturan" subtitle="Preferensi aplikasi tersimpan di perangkat." />

	<div class="space-y-6">
		<!-- Sync -->
		<Card padding="lg">
			<div class="flex items-center justify-between gap-4">
				<div class="min-w-0">
					<h2 class="text-lg font-semibold text-text">Sync Akun</h2>
					<p class="mt-1 text-sm text-muted">
						History, library & kategori tersimpan di perangkat ini.
						{#if syncEngine.loggedIn}
							Tersync otomatis ke akunmu.
						{:else}
							Login untuk sync antar device.
						{/if}
					</p>
				</div>
				{#if syncEngine.loggedIn}
					<Button
						variant="secondary"
						size="sm"
						loading={syncEngine.syncing}
						onclick={() => syncEngine.run()}
					>
						<Cloud size={15} /> Sync sekarang
					</Button>
				{:else}
					<Button href="/login" size="sm">Login</Button>
				{/if}
			</div>
			{#if syncEngine.loggedIn && syncEngine.lastSyncedAt}
				<p class="mt-3 text-xs text-muted">
					Terakhir sync: {new Date(syncEngine.lastSyncedAt).toLocaleTimeString('id-ID')}
				</p>
			{/if}
		</Card>

		<!-- Appearance -->
		<Card padding="lg">
			<h2 class="mb-4 text-lg font-semibold text-text">Tampilan</h2>

			<p class="mb-2 text-sm font-medium text-text">Tema</p>
			<div class="mb-5 grid grid-cols-3 gap-2">
				{#each themes as t}
					<button
						type="button"
						onclick={() => preferences.setTheme(t.value)}
						class="flex flex-col items-center gap-1.5 rounded-[var(--radius)] border px-3 py-3 text-xs font-medium transition {preferences.theme ===
						t.value
							? 'border-accent/40 bg-accent/15 text-accent'
							: 'border-border bg-surface text-muted hover:bg-surface-hover'}"
					>
						<t.icon size={18} />
						{t.label}
					</button>
				{/each}
			</div>

			<div class="hidden lg:block">
				<Switch
					label="Ciutkan sidebar (desktop)"
					description="Mulai dengan sidebar mode ikon."
					checked={preferences.sidebarCollapsed}
					onchange={(v) => preferences.setSidebarCollapsed(v)}
				/>
			</div>
		</Card>

		<!-- Reader defaults -->
		<Card padding="lg">
			<h2 class="mb-4 text-lg font-semibold text-text">Default Reader</h2>

			<p class="mb-2 text-sm font-medium text-text">Mode baca</p>
			<div class="mb-5 grid grid-cols-3 gap-2">
				{#each modes as m}
					<button
						type="button"
						onclick={() => readerSettings.set('mode', m.value)}
						class="flex flex-col items-center gap-1.5 rounded-[var(--radius)] border px-3 py-3 text-xs font-medium transition {readerSettings.mode ===
						m.value
							? 'border-accent/40 bg-accent/15 text-accent'
							: 'border-border bg-surface text-muted hover:bg-surface-hover'}"
					>
						<m.icon size={18} />
						{m.label}
					</button>
				{/each}
			</div>

			<div>
				<div class="mb-2 flex items-center justify-between">
					<p class="text-sm font-medium text-text">Kecerahan default</p>
					<span class="text-xs tabular-nums text-muted">{Math.round(readerSettings.brightness * 100)}%</span>
				</div>
				<input
					type="range"
					min="0.2"
					max="1"
					step="0.05"
					value={readerSettings.brightness}
					oninput={(e) => readerSettings.set('brightness', Number(e.currentTarget.value))}
					class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-hover accent-accent"
				/>
			</div>
		</Card>

		<!-- Content -->
		<Card padding="lg">
			<h2 class="mb-4 text-lg font-semibold text-text">Konten</h2>
			<div class="space-y-4">
				<Switch
					label="Tampilkan konten NSFW"
					description="Extension dan source bertanda NSFW akan ditampilkan."
					checked={preferences.showNsfw}
					onchange={(v) => preferences.setShowNsfw(v)}
				/>
				<Switch
					label="Hemat data"
					description="Lewati pengayaan detail di browse dan kurangi preload halaman di reader."
					checked={preferences.dataSaver}
					onchange={(v) => preferences.setDataSaver(v)}
				/>
			</div>
		</Card>

		<!-- Data management -->
		<Card padding="lg">
			<h2 class="mb-1 text-lg font-semibold text-text">Kelola Data</h2>
			<p class="mb-4 text-sm text-muted">Hapus data yang tersimpan di perangkat ini.</p>
			<div class="space-y-2">
				<div class="flex items-center justify-between gap-4">
					<div class="min-w-0">
						<p class="text-sm font-medium text-text">Riwayat baca</p>
						<p class="text-xs text-muted">{localData.history.length} entri riwayat.</p>
					</div>
					<Button variant="secondary" size="sm" onclick={() => (confirmHistory = true)} disabled={localData.history.length === 0}>
						<Trash2 size={14} /> Hapus
					</Button>
				</div>
				<div class="flex items-center justify-between gap-4 border-t border-border pt-2">
					<div class="min-w-0">
						<p class="text-sm font-medium text-text">Chapter offline</p>
						<p class="text-xs text-muted">Hapus semua unduhan dari perangkat.</p>
					</div>
					<Button variant="secondary" size="sm" loading={clearingDownloads} onclick={() => (confirmDownloads = true)}>
						<Trash2 size={14} /> Hapus semua
					</Button>
				</div>
			</div>
		</Card>

		<!-- Backup -->
		<Card padding="lg">
			<h2 class="mb-1 text-lg font-semibold text-text">Backup</h2>
			<p class="mb-4 text-sm text-muted">
				Ekspor riwayat, library, dan kategori ke file — pindahkan ke perangkat lain tanpa login.
			</p>
			<div class="flex flex-wrap gap-2">
				<Button variant="secondary" size="sm" loading={exporting} onclick={exportBackup}>
					<Download size={14} /> Ekspor ke file
				</Button>
				<Button variant="secondary" size="sm" loading={importing} onclick={pickImportFile}>
					<Upload size={14} /> Impor dari file
				</Button>
				<input
					bind:this={importFileInput}
					type="file"
					accept="application/json"
					class="hidden"
					onchange={handleImportFile}
				/>
			</div>
		</Card>

		<!-- Help -->
		<Card padding="lg">
			<h2 class="mb-1 text-lg font-semibold text-text">Bantuan</h2>
			<p class="mb-4 text-sm text-muted">
				Pintasan keyboard: tekan <kbd class="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs">?</kbd> di mana saja (bukan di reader),
				atau <kbd class="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs">⌘K</kbd> /
				<kbd class="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs">Ctrl+K</kbd> untuk command palette.
			</p>
			<Button
				variant="secondary"
				size="sm"
				onclick={() => {
					window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
				}}
			>
				Lihat pintasan keyboard
			</Button>
		</Card>

		<p class="pt-2 text-center text-xs text-muted">Komik Reader v{__APP_VERSION__}</p>
	</div>
</section>

<Modal bind:open={confirmHistory} title="Hapus riwayat baca?">
	<p class="text-sm text-muted">Seluruh riwayat baca di perangkat ini akan dihapus. Tidak bisa dibatalkan.</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmHistory = false)}>Batal</Button>
		<Button variant="danger" onclick={clearHistory}>Hapus</Button>
	{/snippet}
</Modal>

<Modal bind:open={confirmDownloads} title="Hapus semua unduhan?">
	<p class="text-sm text-muted">Semua chapter offline akan dihapus dari perangkat ini.</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmDownloads = false)}>Batal</Button>
		<Button variant="danger" loading={clearingDownloads} onclick={clearDownloads}>Hapus semua</Button>
	{/snippet}
</Modal>
