<script lang="ts">
	interface Props {
		class?: string;
		rounded?: string;
	}
	let { class: klass = 'h-4 w-full', rounded = 'rounded-[var(--radius-sm)]' }: Props = $props();
</script>

<div class="animate-pulse bg-surface-hover {rounded} {klass}" aria-hidden="true"></div>
