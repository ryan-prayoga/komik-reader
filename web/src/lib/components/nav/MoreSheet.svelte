<script lang="ts">
	import { page } from '$app/stores';
	import { manageNav, adminNav, isActive } from '$lib/nav';
	import { preferences, type Theme } from '$lib/preferences.svelte';
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Monitor from '@lucide/svelte/icons/monitor';
	import LogOut from '@lucide/svelte/icons/log-out';
	import LogIn from '@lucide/svelte/icons/log-in';

	interface Props {
		open?: boolean;
		user?: { username: string; is_admin?: boolean } | null;
		canLogin?: boolean;
	}
	let { open = $bindable(false), user, canLogin = false }: Props = $props();

	const items = $derived(user?.is_admin ? [...manageNav, adminNav] : manageNav);
	const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
		{ value: 'light', label: 'Terang', icon: Sun },
		{ value: 'system', label: 'Sistem', icon: Monitor },
		{ value: 'dark', label: 'Gelap', icon: Moon }
	];
</script>

<Sheet bind:open title="Menu" side="bottom">
	{#if user}
		<div class="mb-4 flex items-center gap-3 rounded-[var(--radius)] border border-border bg-surface p-3">
			<span class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-hover text-sm font-semibold uppercase text-text">
				{user.username.slice(0, 1)}
			</span>
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium text-text">{user.username}</p>
				{#if user.is_admin}<p class="text-xs text-accent">admin</p>{/if}
			</div>
			<form method="POST" action="/logout">
				<button
					type="submit"
					class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted transition hover:bg-surface-hover hover:text-danger"
				>
					<LogOut size={15} /> Keluar
				</button>
			</form>
		</div>
	{:else if canLogin}
		<a
			href="/login"
			onclick={() => (open = false)}
			class="mb-4 flex items-center justify-center gap-2 rounded-[var(--radius)] bg-accent px-4 py-3 text-sm font-medium text-white transition hover:bg-accent-hover"
		>
			<LogIn size={16} /> Masuk untuk menyimpan
		</a>
	{/if}

	<div class="grid grid-cols-2 gap-2">
		{#each items as item}
			{@const active = isActive($page.url.pathname, item.href)}
			<a
				href={item.href}
				onclick={() => (open = false)}
				class="flex items-center gap-3 rounded-[var(--radius)] border px-3 py-3 text-sm font-medium transition {active
					? 'border-accent/40 bg-accent/15 text-accent'
					: 'border-border bg-surface text-text hover:bg-surface-hover'}"
			>
				<item.icon size={18} class="shrink-0" />
				<span class="truncate">{item.label}</span>
			</a>
		{/each}
	</div>

	<p class="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-muted">Tema</p>
	<div class="grid grid-cols-3 gap-2">
		{#each themes as t}
			<button
				type="button"
				onclick={() => preferences.setTheme(t.value)}
				class="flex flex-col items-center gap-1.5 rounded-[var(--radius)] border px-3 py-3 text-xs font-medium transition {preferences.theme ===
				t.value
					? 'border-accent/40 bg-accent/15 text-accent'
					: 'border-border bg-surface text-muted hover:bg-surface-hover'}"
			>
				<t.icon size={18} />
				{t.label}
			</button>
		{/each}
	</div>
</Sheet>
