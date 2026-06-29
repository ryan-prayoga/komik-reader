<script lang="ts">
	interface Props {
		checked?: boolean;
		label?: string;
		description?: string;
		disabled?: boolean;
		onchange?: (value: boolean) => void;
		class?: string;
	}

	let {
		checked = $bindable(false),
		label,
		description,
		disabled = false,
		onchange,
		class: klass = ''
	}: Props = $props();

	function toggle() {
		if (disabled) return;
		checked = !checked;
		onchange?.(checked);
	}
</script>

<div class="flex items-center justify-between gap-4 {klass}">
	{#if label || description}
		<div class="min-w-0">
			{#if label}<p class="text-sm font-medium text-text">{label}</p>{/if}
			{#if description}<p class="text-xs text-muted">{description}</p>{/if}
		</div>
	{/if}
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={label}
		{disabled}
		onclick={toggle}
		class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50 {checked
			? 'bg-accent'
			: 'bg-surface-hover'}"
	>
		<span
			class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition {checked
				? 'translate-x-5'
				: 'translate-x-0.5'}"
		></span>
	</button>
</div>
