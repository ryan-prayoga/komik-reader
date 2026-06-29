<script lang="ts">
	import { onMount } from 'svelte';

	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let deferred = $state<BeforeInstallPromptEvent | null>(null);
	let visible = $state(false);
	let dismissed = $state(false);

	onMount(() => {
		if (window.matchMedia('(display-mode: standalone)').matches) return;

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
		dismissed = true;
	}
</script>

{#if visible && !dismissed}
	<div
		class="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-lg items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3 shadow-lg sm:left-auto"
	>
		<div>
			<p class="text-sm font-medium">Install Komik Reader</p>
			<p class="text-xs text-muted">Akses cepat dari home screen, seperti app native.</p>
		</div>
		<div class="flex shrink-0 gap-2">
			<button
				class="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-text"
				onclick={dismiss}
			>
				Nanti
			</button>
			<button
				class="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
				onclick={install}
			>
				Install
			</button>
		</div>
	</div>
{/if}