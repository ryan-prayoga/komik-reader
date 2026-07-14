<script lang="ts">
	import { isOnline } from '$lib/offline/connection.svelte';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
</script>

	{#if !isOnline()}
		<div
			role="status"
			aria-live="polite"
			class="flex items-center justify-center gap-2 border-b border-accent/30 bg-accent/10 px-4 py-2 text-center text-sm text-accent"
		>
		<WifiOff size={15} />
		<span>
			Offline — baca chapter tersimpan di
			<a href="/downloads" class="font-medium underline hover:no-underline">Perangkat</a>
		</span>
	</div>
{/if}
