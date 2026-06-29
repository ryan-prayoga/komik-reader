<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		open?: boolean;
		title?: string;
		side?: 'bottom' | 'right';
		children?: Snippet;
		onclose?: () => void;
	}

	let { open = $bindable(false), title, side = 'bottom', children, onclose }: Props = $props();

	function close() {
		open = false;
		onclose?.();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}

	const panelPos = $derived(
		side === 'right'
			? 'inset-y-0 right-0 h-full w-full max-w-sm rounded-l-2xl'
			: 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl'
	);
	const flyParams = $derived(side === 'right' ? { x: 320, duration: 220 } : { y: 320, duration: 220 });
</script>

<svelte:window onkeydown={open ? onkeydown : undefined} />

{#if open}
	<div class="fixed inset-0 z-[100]">
		<button
			type="button"
			aria-label="Tutup"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			transition:fade={{ duration: 150 }}
			onclick={close}
		></button>
		<div
			class="absolute {panelPos} flex flex-col border border-border bg-bg shadow-(--shadow-float)"
			style="padding-bottom: env(safe-area-inset-bottom)"
			transition:fly={flyParams}
			role="dialog"
			aria-modal="true"
		>
			{#if title}
				<div class="flex items-center justify-between border-b border-border px-4 py-3">
					<h2 class="text-sm font-semibold text-text">{title}</h2>
					<button
						type="button"
						aria-label="Tutup"
						class="rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-text"
						onclick={close}
					>
						<X size={18} />
					</button>
				</div>
			{/if}
			<div class="overflow-y-auto p-4">
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
