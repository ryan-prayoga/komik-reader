<script lang="ts">
	import { preferences } from '$lib/preferences.svelte';
</script>

<section class="max-w-2xl">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold">Settings</h1>
		<p class="mt-1 text-sm text-muted">Preferensi aplikasi di perangkat kamu.</p>
	</div>

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
</section>