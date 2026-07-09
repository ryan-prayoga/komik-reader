<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
		/** Accessible status for screen readers when spinner is the sole loading cue. */
		label?: string;
	}
	let { size = 20, class: klass = '', label }: Props = $props();
</script>

{#if label}
	<span class="inline-flex items-center gap-2 {klass}" role="status" aria-live="polite">
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			class="animate-spin"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25" />
			<path
				d="M12 2a10 10 0 0 1 10 10"
				stroke="currentColor"
				stroke-width="3"
				stroke-linecap="round"
			/>
		</svg>
		<span class="sr-only">{label}</span>
	</span>
{:else}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		class="animate-spin {klass}"
		aria-hidden="true"
	>
		<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25" />
		<path
			d="M12 2a10 10 0 0 1 10 10"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
		/>
	</svg>
{/if}
