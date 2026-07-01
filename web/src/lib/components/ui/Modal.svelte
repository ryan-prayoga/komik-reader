<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		open?: boolean;
		title?: string;
		children?: Snippet;
		footer?: Snippet;
		onclose?: () => void;
	}

	let { open = $bindable(false), title, children, footer, onclose }: Props = $props();

	function close() {
		open = false;
		onclose?.();
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={open ? onkeydown : undefined} />

{#if open}
	<div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
		<button
			type="button"
			aria-label="Tutup"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			transition:fade={{ duration: 150 }}
			onclick={close}
		></button>
		<div
			class="panel-cut relative z-10 w-full max-w-md border-[1.5px] border-border bg-bg shadow-(--shadow-float)"
			transition:scale={{ duration: 180, start: 0.95 }}
			role="dialog"
			aria-modal="true"
		>
			<div class="flex items-center justify-between border-b border-border px-5 py-4">
				<h2 class="text-base font-semibold text-text">{title}</h2>
				<button
					type="button"
					aria-label="Tutup"
					class="rounded-[var(--radius-sm)] p-1.5 text-muted transition hover:bg-surface hover:text-text"
					onclick={close}
				>
					<X size={18} />
				</button>
			</div>
			<div class="px-5 py-4">{@render children?.()}</div>
			{#if footer}
				<div class="flex justify-end gap-2 border-t border-border px-5 py-4">
					{@render footer()}
				</div>
			{/if}
		</div>
	</div>
{/if}
