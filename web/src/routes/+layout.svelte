<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';

	let { children } = $props();

	const links = [
		{ href: '/', label: 'Home' },
		{ href: '/extensions', label: 'Extensions' },
		{ href: '/search', label: 'Search' },
		{ href: '/downloads', label: 'Downloads' },
		{ href: '/offline', label: 'Offline' }
	];
</script>

<svelte:head>
	<title>Komik Reader</title>
	<meta name="theme-color" content="#0a0a0a" />
</svelte:head>

<div class="min-h-screen bg-bg text-text">
	<OfflineBanner />
	<header class="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur">
		<div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
			<a href="/" class="text-lg font-semibold tracking-tight">
				Komik<span class="text-accent">Reader</span>
			</a>
			<nav class="flex flex-wrap justify-end gap-1">
				{#each links as link}
					<a
						href={link.href}
						class="rounded-lg px-3 py-2 text-sm transition {$page.url.pathname === link.href
							? 'bg-surface text-accent'
							: 'text-muted hover:bg-surface hover:text-text'}"
					>
						{link.label}
					</a>
				{/each}
			</nav>
		</div>
	</header>

	<main class="mx-auto max-w-6xl px-4 py-6">
		{@render children()}
	</main>
</div>