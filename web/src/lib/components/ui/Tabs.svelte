<script lang="ts">
	interface TabItem {
		value: string;
		label: string;
		badge?: string | number;
	}

	interface Props {
		items: TabItem[];
		active?: string;
		onchange?: (value: string) => void;
		class?: string;
	}

	let { items, active = $bindable(items[0]?.value), onchange, class: klass = '' }: Props =
		$props();

	function select(value: string) {
		active = value;
		onchange?.(value);
	}
</script>

<div class="flex gap-1 overflow-x-auto border-b border-border {klass}" role="tablist">
	{#each items as item}
		<button
			type="button"
			role="tab"
			aria-selected={active === item.value}
			onclick={() => select(item.value)}
			class="relative shrink-0 px-4 py-2.5 text-sm font-medium transition {active === item.value
				? 'text-accent'
				: 'text-muted hover:text-text'}"
		>
			<span class="inline-flex items-center gap-1.5">
				{item.label}
				{#if item.badge !== undefined}
					<span class="rounded-full bg-surface-hover px-1.5 py-0.5 text-xs text-muted">
						{item.badge}
					</span>
				{/if}
			</span>
			{#if active === item.value}
				<span class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"></span>
			{/if}
		</button>
	{/each}
</div>
