<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { motionDuration } from '$lib/utils/motion';

	interface Props {
		trigger: Snippet<[{ open: boolean; toggle: () => void }]>;
		children: Snippet<[{ close: () => void }]>;
		align?: 'left' | 'right';
		class?: string;
	}

	let { trigger, children, align = 'right', class: klass = '' }: Props = $props();

	let open = $state(false);
	let root: HTMLElement;
	let menuEl: HTMLElement | null = $state(null);

	function toggle() {
		open = !open;
	}
	function close() {
		open = false;
	}

	function menuItems(): HTMLElement[] {
		if (!menuEl) return [];
		return Array.from(
			menuEl.querySelectorAll<HTMLElement>('button, a[href], [role="menuitem"]')
		).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
	}

	function focusItem(index: number) {
		const items = menuItems();
		if (!items.length) return;
		const i = ((index % items.length) + items.length) % items.length;
		items[i]?.focus();
	}

	function onwindowclick(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) close();
	}

	function onwindowkeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
			root?.querySelector<HTMLElement>('button, a, [tabindex]')?.focus();
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			const items = menuItems();
			const idx = items.indexOf(document.activeElement as HTMLElement);
			focusItem(idx < 0 ? 0 : idx + 1);
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			const items = menuItems();
			const idx = items.indexOf(document.activeElement as HTMLElement);
			focusItem(idx < 0 ? items.length - 1 : idx - 1);
			return;
		}
		if (e.key === 'Home') {
			e.preventDefault();
			focusItem(0);
			return;
		}
		if (e.key === 'End') {
			e.preventDefault();
			focusItem(menuItems().length - 1);
		}
	}

	$effect(() => {
		if (!open) return;
		queueMicrotask(() => {
			for (const el of menuItems()) {
				if (!el.getAttribute('role')) el.setAttribute('role', 'menuitem');
				if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
			}
			focusItem(0);
		});
	});
</script>

<svelte:window onclick={onwindowclick} onkeydown={onwindowkeydown} />

<div bind:this={root} class="relative {klass}">
	{@render trigger({ open, toggle })}
	{#if open}
		<div
			bind:this={menuEl}
			transition:fade={{ duration: motionDuration(120) }}
			class="absolute z-50 mt-2 min-w-44 overflow-hidden rounded-[var(--radius)] border border-border bg-surface p-1 shadow-(--shadow-pop) {align ===
			'right'
				? 'right-0'
				: 'left-0'}"
			role="menu"
		>
			{@render children({ close })}
		</div>
	{/if}
</div>
