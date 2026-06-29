<script lang="ts">
	import { page } from '$app/stores';
	import Shield from '@lucide/svelte/icons/shield';

	let { children } = $props();

	const tabs = [
		{ href: '/admin/users', label: 'Manajemen Akun' },
		{ href: '/admin/server', label: 'Pengaturan Server' }
	];
</script>

<div class="mx-auto max-w-4xl">
	<div class="mb-6 flex items-center gap-3">
		<span class="flex h-11 w-11 items-center justify-center rounded-[var(--radius)] bg-accent/15 text-accent">
			<Shield size={22} />
		</span>
		<div>
			<p class="text-xs font-medium uppercase tracking-wider text-muted">Admin</p>
			<h1 class="text-2xl font-semibold tracking-tight text-text">Panel Admin</h1>
		</div>
	</div>

	<nav class="mb-6 flex gap-1 overflow-x-auto border-b border-border">
		{#each tabs as tab}
			{@const active = $page.url.pathname === tab.href}
			<a
				href={tab.href}
				class="relative shrink-0 px-4 py-2.5 text-sm font-medium transition {active
					? 'text-accent'
					: 'text-muted hover:text-text'}"
			>
				{tab.label}
				{#if active}
					<span class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"></span>
				{/if}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>
