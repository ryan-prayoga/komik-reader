<script lang="ts">
	import { page } from '$app/stores';
	import { primaryNav, manageNav, adminNav, isActive } from '$lib/nav';
	import Menu from '@lucide/svelte/icons/menu';

	interface Props {
		user?: { is_admin?: boolean } | null;
		onmore: () => void;
	}
	let { user, onmore }: Props = $props();

	// "More" is active whenever a non-primary (manage/admin) route is open.
	const manageHrefs = $derived([
		...manageNav.map((i) => i.href),
		...(user?.is_admin ? [adminNav.href] : [])
	]);
	const moreActive = $derived(manageHrefs.some((h) => isActive($page.url.pathname, h)));

	// Compact icon-only nav on short landscape phones.
	let compact = $state(false);
	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(max-height: 500px) and (orientation: landscape)');
		const sync = () => {
			compact = mq.matches;
		};
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur lg:hidden"
	style="padding-bottom: env(safe-area-inset-bottom)"
	aria-label="Navigasi utama"
>
	<div class="mx-auto grid max-w-md grid-cols-5">
		{#each primaryNav as item}
			{@const active = isActive($page.url.pathname, item.href)}
			<a
				href={item.href}
				class="flex min-h-11 flex-col items-center justify-center gap-0.5 py-2 font-medium transition active:scale-95 {compact
					? ''
					: 'text-[0.7rem]'} {active ? 'text-accent' : 'text-muted'}"
				aria-label={item.label}
				aria-current={active ? 'page' : undefined}
			>
				<item.icon size={20} class="transition-transform duration-200 {active ? 'scale-110' : ''}" />
				{#if !compact}<span>{item.label}</span>{/if}
			</a>
		{/each}
		<button
			type="button"
			onclick={onmore}
			aria-label="Lainnya"
			class="flex min-h-11 flex-col items-center justify-center gap-0.5 py-2 font-medium transition active:scale-95 {compact
				? ''
				: 'text-[0.7rem]'} {moreActive ? 'text-accent' : 'text-muted'}"
		>
			<Menu size={20} />
			{#if !compact}<span>Lainnya</span>{/if}
		</button>
	</div>
</nav>
