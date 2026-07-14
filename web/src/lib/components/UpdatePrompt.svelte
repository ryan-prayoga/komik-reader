<script lang="ts">
	import { browser } from '$app/environment';
	import { afterNavigate } from '$app/navigation';
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import { readable } from 'svelte/store';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Button from '$lib/components/ui/Button.svelte';
	import { setUpdatePromptActive } from '$lib/stores/prompt-slot.svelte';

	// In autoUpdate mode vite-pwa force-reloads the page the moment a new SW
	// activates — with the hourly poll below that meant a deploy could reload the
	// app mid-chapter and dump the user out of the reader. Defer the reload while
	// on /read/* and run it on the first navigation that leaves the reader.
	let reloadPending = false;

	function reloadOutsideReader() {
		if (window.location.pathname.startsWith('/read/')) {
			reloadPending = true;
		} else {
			window.location.reload();
		}
	}

	afterNavigate(() => {
		if (reloadPending && !window.location.pathname.startsWith('/read/')) {
			window.location.reload();
		}
	});

	const { needRefresh, updateServiceWorker } = browser
		? useRegisterSW({
				onNeedReload: reloadOutsideReader,
				onRegisteredSW(_url, registration) {
					// Long-lived tabs (e.g. mid-chapter) never revisit the network layer that
					// would otherwise surface an update, so poll for a new worker hourly.
					if (!registration) return;
					setInterval(() => registration.update(), 60 * 60 * 1000);
				}
			})
		: {
				needRefresh: readable(false),
				updateServiceWorker: async () => {}
			};

	let reloading = $state(false);

	// Claim the shared bottom slot so InstallPrompt stays hidden while update is up.
	$effect(() => {
		setUpdatePromptActive($needRefresh);
		return () => setUpdatePromptActive(false);
	});

	async function reload() {
		reloading = true;
		await updateServiceWorker(true);
	}
</script>

{#if $needRefresh}
	<div
		class="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-[60] mx-auto flex max-w-lg items-center justify-between gap-4 rounded-[var(--radius)] border border-border bg-surface px-4 py-3 shadow-(--shadow-float) sm:left-auto lg:bottom-4"
		role="status"
		aria-live="polite"
	>
		<div class="flex items-center gap-3">
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent"
			>
				<RefreshCw size={18} />
			</div>
			<div>
				<p class="text-sm font-medium text-text">Update tersedia</p>
				<p class="text-xs text-muted">Versi baru siap dipakai.</p>
			</div>
		</div>
		<Button variant="primary" size="sm" onclick={reload} loading={reloading}>Muat ulang</Button>
	</div>
{/if}
