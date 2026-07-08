<script lang="ts">
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import LayoutList from '@lucide/svelte/icons/layout-list';

	interface Props {
		value?: 'list' | 'grid';
		onchange?: (v: 'list' | 'grid') => void;
	}
	let { value = $bindable('grid'), onchange }: Props = $props();

	function set(v: 'list' | 'grid') {
		value = v;
		onchange?.(v);
	}
</script>

<div class="flex items-center rounded-[var(--radius)] border border-border bg-surface p-1">
	<button
		type="button"
		onclick={() => set('list')}
		aria-label="Tampilan list"
		aria-pressed={value === 'list'}
		class="rounded-md p-1.5 transition {value === 'list' ? 'bg-accent text-white' : 'text-muted hover:text-text'}"
	>
		<LayoutList size={15} />
	</button>
	<button
		type="button"
		onclick={() => set('grid')}
		aria-label="Tampilan grid"
		aria-pressed={value === 'grid'}
		class="rounded-md p-1.5 transition {value === 'grid' ? 'bg-accent text-white' : 'text-muted hover:text-text'}"
	>
		<LayoutGrid size={15} />
	</button>
</div>
