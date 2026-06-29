<script lang="ts">
	import type { Extension } from '$lib/graphql/types';
	import { apiUrl } from '$lib/graphql/client';
	import { updateExtension } from '$lib/graphql/api';

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

<div class="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
	<div class="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-bg">
		{#if extension.iconUrl}
			<img src={apiUrl(extension.iconUrl)} alt="" class="h-full w-full object-cover" />
		{/if}
	</div>

	<div class="min-w-0 flex-1">
		<div class="flex flex-wrap items-center gap-2">
			<h3 class="font-medium">{extension.name}</h3>
			{#if extension.isInstalled}
				<span class="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">Installed</span>
			{/if}
			{#if extension.isNsfw}
				<span class="rounded-full bg-danger/15 px-2 py-0.5 text-xs text-danger">18+</span>
			{/if}
			{#if extension.hasUpdate}
				<span class="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">Update</span>
			{/if}
		</div>
		<p class="mt-1 text-sm text-muted">
			v{extension.versionName} · {extension.lang}
		</p>
		{#if error}
			<p class="mt-1 text-xs text-danger">{error}</p>
		{/if}
	</div>

	<div class="flex shrink-0 flex-wrap justify-end gap-2">
		{#if extension.isObsolete}
			<button
				class="rounded-lg bg-danger/20 px-4 py-2 text-sm text-danger transition hover:bg-danger/30 disabled:opacity-50"
				disabled={loading}
				onclick={() => runAction({ uninstall: true })}
			>
				{loading ? '...' : 'Remove'}
			</button>
		{:else if extension.isInstalled}
			{#if extension.hasUpdate}
				<button
					class="rounded-lg border border-border bg-surface-hover px-4 py-2 text-sm transition hover:border-muted disabled:opacity-50"
					disabled={loading}
					onclick={() => runAction({ update: true })}
				>
					{loading ? '...' : 'Update'}
				</button>
			{/if}
			<button
				class="rounded-lg border border-border bg-surface-hover px-4 py-2 text-sm transition hover:border-muted disabled:opacity-50"
				disabled={loading}
				onclick={() => runAction({ uninstall: true })}
			>
				{loading ? '...' : 'Uninstall'}
			</button>
		{:else}
			<button
				class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
				disabled={loading}
				onclick={() => runAction({ install: true })}
			>
				{loading ? 'Installing...' : 'Install'}
			</button>
		{/if}
	</div>
</div>