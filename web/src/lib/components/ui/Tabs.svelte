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

	let tablistEl = $state<HTMLDivElement | null>(null);

	function select(value: string) {
		active = value;
		onchange?.(value);
	}

	/**
	 * The tablist pattern is keyboard-driven: arrows move between tabs (wrapping),
	 * Home/End jump to the ends, and only the active tab is tabbable — a roving
	 * tabindex. Previously every tab was a separate tab stop and the arrow keys
	 * did nothing, which is half the pattern announced but not implemented.
	 */
	function onkeydown(e: KeyboardEvent) {
		const idx = items.findIndex((i) => i.value === active);
		if (idx < 0) return;
		let next = -1;
		if (e.key === 'ArrowRight') next = (idx + 1) % items.length;
		else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = items.length - 1;
		if (next < 0) return;

		e.preventDefault();
		select(items[next].value);
		tablistEl?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
	}
</script>

<div
	bind:this={tablistEl}
	class="flex gap-1 overflow-x-auto border-b border-border {klass}"
	role="tablist"
>
	{#each items as item}
		<button
			type="button"
			role="tab"
			aria-selected={active === item.value}
			tabindex={active === item.value ? 0 : -1}
			{onkeydown}
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
