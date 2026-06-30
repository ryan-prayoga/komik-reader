<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toasts, dismissToast } from '$lib/stores/toast.svelte';
	import X from '@lucide/svelte/icons/x';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import AlertCircle from '@lucide/svelte/icons/alert-circle';
	import Info from '@lucide/svelte/icons/info';

	const icons = { success: CheckCircle, error: AlertCircle, info: Info };
	const colors = {
		success: 'border-success/30 bg-success/10 text-success',
		error: 'border-danger/30 bg-danger/10 text-danger',
		info: 'border-accent/30 bg-accent/10 text-accent'
	};
</script>

<div class="fixed bottom-20 right-4 z-[200] flex flex-col gap-2 lg:bottom-6">
	{#each toasts as toast (toast.id)}
		<div
			role="alert"
			transition:fly={{ y: 12, duration: 200 }}
			class="flex min-w-56 max-w-xs items-start gap-3 rounded-[var(--radius)] border px-4 py-3 shadow-(--shadow-float) {colors[toast.type]}"
		>
			<svelte:component this={icons[toast.type]} size={16} class="mt-0.5 shrink-0" />
			<p class="flex-1 text-sm">{toast.message}</p>
			<button
				class="shrink-0 opacity-60 transition hover:opacity-100"
				onclick={() => dismissToast(toast.id)}
				aria-label="Tutup"
			>
				<X size={14} />
			</button>
		</div>
	{/each}
</div>
