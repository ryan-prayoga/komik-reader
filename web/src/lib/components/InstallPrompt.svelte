<script lang="ts">
	import { onMount } from 'svelte';
	import Download from '@lucide/svelte/icons/download';
	import Share from '@lucide/svelte/icons/share';
	import Button from '$lib/components/ui/Button.svelte';

	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	const DISMISS_KEY = 'komik-install-dismissed';

	let deferred = $state<BeforeInstallPromptEvent | null>(null);
	let visible = $state(false);
	let isIos = $state(false);

	function alreadyDismissed(): boolean {
		try {
			return localStorage.getItem(DISMISS_KEY) === '1';
		} catch {
			return false;
		}
	}

	onMount(() => {
		if (window.matchMedia('(display-mode: standalone)').matches) return;
		// @ts-expect-error — iOS-only standalone flag
		if (window.navigator.standalone) return;
		if (alreadyDismissed()) return;

		// iOS Safari never fires beforeinstallprompt; detect it so we can show the
		// manual "Share → Add to Home Screen" hint instead of nothing.
		const ua = window.navigator.userAgent;
		const iosDevice = /iP(hone|ad|od)/.test(ua);
		const webkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
		if (iosDevice && webkit) {
			isIos = true;
			visible = true;
			return;
		}

		const onPrompt = (e: Event) => {
			e.preventDefault();
			deferred = e as BeforeInstallPromptEvent;
			visible = true;
		};
		window.addEventListener('beforeinstallprompt', onPrompt);
		return () => window.removeEventListener('beforeinstallprompt', onPrompt);
	});

	async function install() {
		if (!deferred) return;
		await deferred.prompt();
		await deferred.userChoice;
		visible = false;
		deferred = null;
	}

	function dismiss() {
		visible = false;
		try {
			localStorage.setItem(DISMISS_KEY, '1');
		} catch {
			/* ignore */
		}
	}
</script>

{#if visible}
	<div
		class="fixed bottom-20 left-4 right-4 z-[60] mx-auto flex max-w-lg items-center justify-between gap-4 rounded-[var(--radius)] border border-border bg-surface px-4 py-3 shadow-(--shadow-float) sm:bottom-4 sm:left-auto"
	>
		<div class="flex items-center gap-3">
			<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
				<Download size={18} />
			</div>
			<div>
				<p class="text-sm font-medium text-text">Install Komik Reader</p>
				{#if isIos}
					<p class="flex items-center gap-1 text-xs text-muted">
						Tap <Share size={12} class="inline shrink-0" /> lalu "Tambah ke Layar Utama".
					</p>
				{:else}
					<p class="text-xs text-muted">Akses cepat dari layar utama, seperti app native.</p>
				{/if}
			</div>
		</div>
		<div class="flex shrink-0 gap-2">
			<Button variant="ghost" size="sm" onclick={dismiss}>{isIos ? 'Tutup' : 'Nanti'}</Button>
			{#if !isIos}
				<Button variant="primary" size="sm" onclick={install}>Install</Button>
			{/if}
		</div>
	</div>
{/if}
