<script lang="ts">
	import { page } from '$app/stores';

	let { children } = $props();

	const tabs = [
		{ href: '/admin/users', label: 'Manajemen Akun' },
		{ href: '/admin/server', label: 'Pengaturan Server' }
	];
</script>

<div class="mx-auto max-w-4xl">
	<div class="mb-6">
		<p class="text-xs font-medium uppercase tracking-wider text-muted">Admin</p>
		<h1 class="text-2xl font-semibold">Panel Admin</h1>
	</div>

	<nav class="mb-6 flex gap-1 border-b border-border">
		{#each tabs as tab}
			<a
				href={tab.href}
				class="border-b-2 px-4 py-2.5 text-sm transition {$page.url.pathname === tab.href
					? 'border-accent text-accent'
					: 'border-transparent text-muted hover:text-text'}"
			>
				{tab.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>