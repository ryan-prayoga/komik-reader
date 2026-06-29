<script lang="ts">
	import { page } from '$app/stores';
	import { Button, EmptyState } from '$lib/components/ui';
	import Lock from '@lucide/svelte/icons/lock';

	interface Props {
		title?: string;
		description?: string;
	}
	let {
		title = 'Masuk untuk menyimpan',
		description = 'Fitur ini butuh akun. Browse dan baca tetap bebas tanpa login.'
	}: Props = $props();

	const loginHref = $derived(`/login?redirectTo=${encodeURIComponent($page.url.pathname)}`);
</script>

<EmptyState {title} {description} class="mt-2">
	{#snippet icon()}<Lock size={32} />{/snippet}
	{#snippet action()}<Button href={loginHref}>Masuk</Button>{/snippet}
</EmptyState>
