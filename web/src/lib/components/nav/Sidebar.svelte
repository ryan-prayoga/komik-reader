<script lang="ts">
	import { page } from '$app/stores';
	import { primaryNav, manageNav, adminNav, isActive } from '$lib/nav';
	import { preferences } from '$lib/preferences.svelte';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	import LogOut from '@lucide/svelte/icons/log-out';
	import LogIn from '@lucide/svelte/icons/log-in';

	interface Props {
		user?: { username: string; is_admin?: boolean } | null;
		canLogin?: boolean;
	}
	let { user, canLogin = false }: Props = $props();

	const collapsed = $derived(preferences.sidebarCollapsed);
	const manage = $derived(user?.is_admin ? [...manageNav, adminNav] : manageNav);

	function linkCls(active: boolean): string {
		const shape = active ? 'panel-cut [--panel-cut:8px]' : 'rounded-[var(--radius)]';
		return `flex min-h-11 items-center gap-3 ${shape} px-3 py-2 text-sm font-medium transition ${
			active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface hover:text-text'
		} ${collapsed ? 'justify-center' : ''}`;
	}
</script>

<aside
	class="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface/40 lg:flex {collapsed
		? 'w-[4.5rem]'
		: 'w-60'}"
>
	<div class="flex items-center gap-2 px-4 py-4 {collapsed ? 'justify-center' : ''}">
		<a href="/" class="flex items-center gap-2 overflow-hidden">
			<span
				class="panel-cut [--panel-cut:6px] flex h-8 w-8 shrink-0 items-center justify-center bg-accent text-sm font-bold text-white"
				>K</span
			>
			{#if !collapsed}
				<span class="truncate font-display text-xl font-bold uppercase tracking-tight"
					>Komik<span class="text-accent">Reader</span></span
				>
			{/if}
		</a>
	</div>

	<nav class="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Navigasi utama">
		{#each primaryNav as item}
			{@const active = isActive($page.url.pathname, item.href)}
			<a
				href={item.href}
				class={linkCls(active)}
				title={collapsed ? item.label : undefined}
				aria-current={active ? 'page' : undefined}
			>
				<item.icon size={18} class="shrink-0" />
				{#if !collapsed}
					<span class="truncate">{item.label}</span>
					{#if item.href === '/search'}
						<kbd
							class="ml-auto rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted"
							>⌘K</kbd
						>
					{/if}
				{/if}
			</a>
		{/each}

		<div class="my-3 border-t border-border"></div>
		{#if !collapsed}
			<p class="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted">Kelola</p>
		{/if}
		{#each manage as item}
			{@const active = isActive($page.url.pathname, item.href)}
			<a
				href={item.href}
				class={linkCls(active)}
				title={collapsed ? item.label : undefined}
				aria-current={active ? 'page' : undefined}
			>
				<item.icon size={18} class="shrink-0" />
				{#if !collapsed}<span class="truncate">{item.label}</span>{/if}
			</a>
		{/each}
	</nav>

	<div class="border-t border-border p-3">
		<div class="flex items-center {collapsed ? 'flex-col gap-2' : 'justify-between gap-2'}">
			<ThemeToggle />
			<button
				type="button"
				onclick={() => preferences.toggleSidebar()}
				aria-label={collapsed ? 'Lebarkan sidebar' : 'Ciutkan sidebar'}
				title={collapsed ? 'Lebarkan' : 'Ciutkan'}
				class="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-muted transition hover:bg-surface hover:text-text"
			>
				{#if collapsed}<PanelLeftOpen size={18} />{:else}<PanelLeftClose size={18} />{/if}
			</button>
		</div>

		{#if user}
			<div class="mt-3 flex items-center gap-2 {collapsed ? 'justify-center' : ''}">
				<span
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-xs font-semibold uppercase text-text"
				>
					{user.username.slice(0, 1)}
				</span>
				{#if !collapsed}
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-text">{user.username}</p>
						{#if user.is_admin}<p class="text-xs text-accent">admin</p>{/if}
					</div>
					<form method="POST" action="/logout">
						<button
							type="submit"
							aria-label="Keluar"
							title="Keluar"
							class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-danger"
						>
							<LogOut size={16} />
						</button>
					</form>
				{/if}
			</div>
		{:else if canLogin}
			<a
				href="/login"
				title="Masuk"
				class="mt-3 flex items-center gap-3 rounded-[var(--radius)] bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-hover {collapsed
					? 'justify-center'
					: ''}"
			>
				<LogIn size={18} class="shrink-0" />
				{#if !collapsed}<span>Masuk</span>{/if}
			</a>
		{/if}
	</div>
</aside>
