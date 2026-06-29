<script lang="ts">
	import { onMount } from 'svelte';
	import Download from '@lucide/svelte/icons/download';
	import Button from '$lib/components/ui/Button.svelte';

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
		class="fixed bottom-20 left-4 right-4 z-[60] mx-auto flex max-w-lg items-center justify-between gap-4 rounded-[var(--radius)] border border-border bg-surface px-4 py-3 shadow-(--shadow-float) sm:bottom-4 sm:left-auto"
	>
		<div class="flex items-center gap-3">
			<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
				<Download size={18} />
			</div>
			<div>
				<p class="text-sm font-medium text-text">Install Komik Reader</p>
				<p class="text-xs text-muted">Akses cepat dari home screen, seperti app native.</p>
			</div>
		</div>
		<div class="flex shrink-0 gap-2">
			<Button variant="ghost" size="sm" onclick={dismiss}>Nanti</Button>
			<Button variant="primary" size="sm" onclick={install}>Install</Button>
		</div>
	</div>
{/if}
