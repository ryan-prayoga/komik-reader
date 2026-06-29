<script lang="ts">
	import { preferences, type Theme } from '$lib/preferences.svelte';
	import { readerSettings, type ReaderMode } from '$lib/reader-settings.svelte';
	import { syncEngine } from '$lib/local/sync.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Card, Switch, Button } from '$lib/components/ui';
	import Cloud from '@lucide/svelte/icons/cloud';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Monitor from '@lucide/svelte/icons/monitor';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Columns2 from '@lucide/svelte/icons/columns-2';

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

			<Switch
				label="Ciutkan sidebar (desktop)"
				description="Mulai dengan sidebar mode ikon."
				checked={preferences.sidebarCollapsed}
				onchange={(v) => preferences.setSidebarCollapsed(v)}
			/>
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
			<Switch
				label="Tampilkan konten NSFW"
				description="Extension dan source bertanda NSFW akan ditampilkan."
				checked={preferences.showNsfw}
				onchange={(v) => preferences.setShowNsfw(v)}
			/>
		</Card>
	</div>
</section>
