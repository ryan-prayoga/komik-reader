<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
	}
	let { size = 20, class: klass = '' }: Props = $props();
</script>

<svg
	class="animate-spin text-current {klass}"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	aria-hidden="true"
>
	<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.2" stroke-width="3" />
	<path
		d="M22 12a10 10 0 0 1-10 10"
		stroke="currentColor"
		stroke-width="3"
		stroke-linecap="round"
	/>
</svg>
