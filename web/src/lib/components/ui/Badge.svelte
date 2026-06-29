<script lang="ts">
	import type { Snippet } from 'svelte';

	type Tone = 'neutral' | 'accent' | 'danger' | 'success' | 'outline';

	interface Props {
		tone?: Tone;
		class?: string;
		children?: Snippet;
	}

	let { tone = 'neutral', class: klass = '', children }: Props = $props();

	const tones: Record<Tone, string> = {
		neutral: 'bg-surface-hover text-muted',
		accent: 'bg-accent/15 text-accent',
		danger: 'bg-danger/15 text-danger',
		success: 'bg-success/15 text-success',
		outline: 'border border-border text-muted'
	};
</script>

<span
	class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium {tones[
		tone
	]} {klass}"
>
	{@render children?.()}
</span>
