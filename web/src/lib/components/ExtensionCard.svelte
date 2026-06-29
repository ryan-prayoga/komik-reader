<script lang="ts">
	import type { Extension } from '$lib/graphql/types';
	import { apiUrl } from '$lib/graphql/client';
	import { updateExtension } from '$lib/graphql/api';
	import Puzzle from '@lucide/svelte/icons/puzzle';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	interface Props {
		extension: Extension;
		onchange?: () => void;
	}

	let { extension, onchange }: Props = $props();

	let loading = $state(false);
	let error = $state('');

	async function runAction(patch: { install?: boolean; uninstall?: boolean; update?: boolean }) {
		loading = true;
		error = '';
		try {
			await updateExtension(extension.pkgName, patch);
			onchange?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal';
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex items-center gap-4 rounded-[var(--radius)] border border-border bg-surface p-4 shadow-(--shadow-card)">
	<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg text-muted">
		{#if extension.iconUrl}
			<img src={apiUrl(extension.iconUrl)} alt="" class="h-full w-full object-cover" />
		{:else}
			<Puzzle size={22} />
		{/if}
	</div>

	<div class="min-w-0 flex-1">
		<div class="flex flex-wrap items-center gap-2">
			<h3 class="font-medium text-text">{extension.name}</h3>
			{#if extension.isInstalled}<Badge tone="success">Installed</Badge>{/if}
			{#if extension.isNsfw}<Badge tone="danger">18+</Badge>{/if}
			{#if extension.hasUpdate}<Badge tone="accent">Update</Badge>{/if}
		</div>
		<p class="mt-1 text-sm text-muted">v{extension.versionName} · {extension.lang}</p>
		{#if error}<p class="mt-1 text-xs text-danger">{error}</p>{/if}
	</div>

	<div class="flex shrink-0 flex-wrap justify-end gap-2">
		{#if extension.isObsolete}
			<Button variant="danger" size="sm" {loading} onclick={() => runAction({ uninstall: true })}>
				Remove
			</Button>
		{:else if extension.isInstalled}
			{#if extension.hasUpdate}
				<Button variant="secondary" size="sm" {loading} onclick={() => runAction({ update: true })}>
					Update
				</Button>
			{/if}
			<Button variant="secondary" size="sm" {loading} onclick={() => runAction({ uninstall: true })}>
				Uninstall
			</Button>
		{:else}
			<Button variant="primary" size="sm" {loading} onclick={() => runAction({ install: true })}>
				Install
			</Button>
		{/if}
	</div>
</div>
