<script lang="ts">
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import Search from '@lucide/svelte/icons/search';
</script>

<header
	class="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/95 px-4 py-2 backdrop-blur lg:hidden"
>
	<a href="/" class="flex items-center gap-2">
		<span class="panel-cut [--panel-cut:5px] flex h-7 w-7 items-center justify-center bg-accent text-xs font-bold text-white"
			>K</span
		>
		<span class="font-display text-base font-bold uppercase tracking-tight"
			>Komik<span class="text-accent">Reader</span></span
		>
	</a>
	<div class="flex items-center gap-1">
		<a
			href="/search"
			aria-label="Cari"
			class="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] text-muted transition hover:bg-surface hover:text-text"
		>
			<Search size={18} />
		</a>
		<ThemeToggle />
	</div>
</header>
