<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';

	let { data, children } = $props();

	const baseLinks = [
		{ href: '/', label: 'Home' },
		{ href: '/library', label: 'Library' },
		{ href: '/search', label: 'Search' },
		{ href: '/history', label: 'History' },
		{ href: '/categories', label: 'Categories' },
		{ href: '/extensions', label: 'Extensions' },
		{ href: '/downloads', label: 'Downloads' },
		{ href: '/offline', label: 'Offline' },
		{ href: '/settings', label: 'Settings' }
	];

	const links = $derived(
		data.user?.is_admin
			? [...baseLinks, { href: '/admin', label: 'Admin' }]
			: baseLinks
	);

	const authPages = ['/login', '/register', '/forgot-password', '/reset-password'];
	const isAuthPage = $derived(authPages.some((p) => $page.url.pathname.startsWith(p)));
	const showShell = $derived(!isAuthPage && (data.authEnabled ? !!data.user : true));
</script>

<svelte:head>
	<title>Komik Reader</title>
	<meta name="theme-color" content="#0a0a0a" />
</svelte:head>

{#if showShell}
	<div class="min-h-screen bg-bg text-text">
		<OfflineBanner />
		<InstallPrompt />
		<header class="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur">
			<div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
				<a href="/" class="text-lg font-semibold tracking-tight">
					Komik<span class="text-accent">Reader</span>
				</a>
				<nav class="flex flex-wrap items-center justify-end gap-1">
					{#each links as link}
						<a
							href={link.href}
							class="rounded-lg px-3 py-2 text-sm transition {$page.url.pathname === link.href ||
							(link.href !== '/' && $page.url.pathname.startsWith(link.href + '/'))
								? 'bg-surface text-accent'
								: 'text-muted hover:bg-surface hover:text-text'}"
						>
							{link.label}
						</a>
					{/each}
					{#if data.user}
						<span class="hidden px-2 text-xs text-muted sm:inline">
							{data.user.username}{data.user.is_admin ? ' · admin' : ''}
						</span>
						<form method="POST" action="/logout">
							<button
								type="submit"
								class="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-surface hover:text-danger"
							>
								Keluar
							</button>
						</form>
					{/if}
				</nav>
			</div>
		</header>

		<main class="mx-auto max-w-6xl px-4 py-6">
			{@render children()}
		</main>
	</div>
{:else}
	<div class="min-h-screen bg-bg px-4 py-6 text-text">
		{@render children()}
	</div>
{/if}