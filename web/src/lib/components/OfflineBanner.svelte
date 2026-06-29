<script lang="ts">
	import { isOnline } from '$lib/offline/connection.svelte';
</script>

{#if !isOnline()}
	<div class="border-b border-accent/30 bg-accent/10 px-4 py-2 text-center text-sm text-accent">
		Offline — baca chapter yang sudah disimpan di
		<a href="/offline" class="underline hover:no-underline">Perangkat</a>
	</div>
{/if}