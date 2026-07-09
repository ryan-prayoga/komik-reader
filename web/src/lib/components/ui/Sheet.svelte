<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { trapFocus } from '$lib/utils/focusTrap';
	import { motionDuration } from '$lib/utils/motion';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		open?: boolean;
		title?: string;
		side?: 'bottom' | 'right';
		/** Dark panel for immersive surfaces (e.g. reader settings over black pages). */
		variant?: 'default' | 'dark';
		children?: Snippet;
		onclose?: () => void;
	}

	let {
		open = $bindable(false),
		title,
		side = 'bottom',
		variant = 'default',
		children,
		onclose
	}: Props = $props();

	const titleId = 'sheet-title-' + Math.random().toString(36).slice(2, 8);

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
	const flyParams = $derived(
		side === 'right'
			? { x: 320, duration: motionDuration(220) }
			: { y: 320, duration: motionDuration(220) }
	);
</script>

<svelte:window onkeydown={open ? onkeydown : undefined} />

{#if open}
	<div class="fixed inset-0 z-[100]">
		<button
			type="button"
			aria-label="Tutup"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			transition:fade={{ duration: motionDuration(150) }}
			onclick={close}
		></button>
		<div
			use:trapFocus
			class="absolute {panelPos} flex flex-col shadow-(--shadow-float) {variant === 'dark'
				? 'border border-white/10 bg-neutral-950 text-white'
				: 'border border-border bg-bg'}"
			style="padding-bottom: env(safe-area-inset-bottom)"
			transition:fly={flyParams}
			role="dialog"
			aria-modal="true"
			aria-labelledby={title ? titleId : undefined}
		>
			{#if title}
				<div
					class="flex items-center justify-between px-4 py-3 {variant === 'dark'
						? 'border-b border-white/10'
						: 'border-b border-border'}"
				>
					<h2
						id={titleId}
						class="text-sm font-semibold {variant === 'dark' ? 'text-white' : 'text-text'}"
					>
						{title}
					</h2>
					<button
						type="button"
						aria-label="Tutup"
						class="rounded-[var(--radius-sm)] p-1.5 transition {variant === 'dark'
							? 'text-white/60 hover:bg-white/10 hover:text-white'
							: 'text-muted hover:bg-surface hover:text-text'}"
						onclick={close}
					>
						<X size={18} />
					</button>
				</div>
			{/if}
			<div class="overflow-y-auto p-4 {variant === 'dark' ? 'text-white/90' : ''}">
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
