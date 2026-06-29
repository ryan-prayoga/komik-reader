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
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur lg:hidden"
	style="padding-bottom: env(safe-area-inset-bottom)"
>
	<div class="mx-auto grid max-w-md grid-cols-5">
		{#each primaryNav as item}
			{@const active = isActive($page.url.pathname, item.href)}
			<a
				href={item.href}
				class="flex flex-col items-center gap-1 py-2 text-[0.65rem] font-medium transition active:scale-95 {active
					? 'text-accent'
					: 'text-muted'}"
			>
				<item.icon size={20} class="transition-transform duration-200 {active ? 'scale-110' : ''}" />
				<span>{item.label}</span>
			</a>
		{/each}
		<button
			type="button"
			onclick={onmore}
			class="flex flex-col items-center gap-1 py-2 text-[0.65rem] font-medium transition active:scale-95 {moreActive
				? 'text-accent'
				: 'text-muted'}"
		>
			<Menu size={20} />
			<span>More</span>
		</button>
	</div>
</nav>
