<script lang="ts">
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import Search from '@lucide/svelte/icons/search';

	// Cmd+K is handled globally by KeyboardShortcuts; this is a visual affordance only on sm+.
</script>

<header
	class="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/95 px-4 pb-2 backdrop-blur lg:hidden"
	style="padding-top: calc(env(safe-area-inset-top) + 0.5rem)"
>
	<a href="/" class="flex items-center gap-2">
		<span
			class="panel-cut [--panel-cut:5px] flex h-7 w-7 items-center justify-center bg-accent text-xs font-bold text-white"
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
			class="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-muted transition hover:bg-surface hover:text-text"
		>
			<Search size={18} />
		</a>
		<ThemeToggle />
	</div>
</header>
