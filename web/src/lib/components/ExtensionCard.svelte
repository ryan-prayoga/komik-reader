<script lang="ts">
	import type { Extension } from '$lib/graphql/types';
	import { apiUrl } from '$lib/graphql/client';
	import { updateExtension } from '$lib/graphql/api';
	import { preferences } from '$lib/preferences.svelte';
	import { langDisplay } from '$lib/lang';
	import Puzzle from '@lucide/svelte/icons/puzzle';
	import Users from '@lucide/svelte/icons/users';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	interface Props {
		extension: Extension;
		/** Admin sees full install/uninstall/update UI + activation counts. */
		admin?: boolean;
		activationCount?: number;
		onchange?: () => void;
		compact?: boolean;
	}

	let { extension, admin = false, activationCount, onchange, compact = false }: Props = $props();

	let loading = $state(false);
	let error = $state('');

	const isActive = $derived(preferences.isExtensionActive(extension.pkgName));

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

	async function activate() {
		loading = true;
		error = '';
		try {
			if (!extension.isInstalled) {
				const res = await fetch('/api/ext/activate', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ pkgName: extension.pkgName })
				});
				const data = await res.json();
				if (!res.ok) throw new Error(data.error ?? 'Gagal install');
			} else {
				// Already installed — just count the activation
				fetch('/api/ext/activate', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ pkgName: extension.pkgName })
				}).catch(() => {});
			}
			preferences.activateExtension(extension.pkgName);
			onchange?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal';
		} finally {
			loading = false;
		}
	}

	function deactivate() {
		preferences.deactivateExtension(extension.pkgName);
		onchange?.();
	}
</script>

{#if compact}
	<!-- Grid card -->
	<div class="flex flex-col items-center gap-2 rounded-[var(--radius)] border border-border bg-surface p-3 shadow-(--shadow-card) text-center">
		<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg text-muted">
			{#if extension.iconUrl}
				<img src={apiUrl(extension.iconUrl)} alt="" class="h-full w-full object-cover" />
			{:else}
				<Puzzle size={22} />
			{/if}
		</div>

		<div class="w-full min-w-0">
			<p class="truncate text-sm font-medium text-text">{extension.name}</p>
			<p class="truncate text-xs text-muted">
				{#if admin}v{extension.versionName} · {/if}{langDisplay(extension.lang)}
			</p>
			<div class="mt-1 flex flex-wrap justify-center gap-1">
				{#if admin && extension.isInstalled}<Badge tone="success">Installed</Badge>{/if}
				{#if !admin && isActive}<Badge tone="accent">Aktif</Badge>{/if}
				{#if extension.isNsfw}<Badge tone="danger">18+</Badge>{/if}
				{#if admin && extension.hasUpdate}<Badge tone="accent">Update</Badge>{/if}
			</div>
			{#if error}<p class="mt-1 text-xs text-danger">{error}</p>{/if}
		</div>

		<div class="flex w-full flex-wrap justify-center gap-1.5">
			{#if admin}
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
			{:else if isActive}
				<Button variant="secondary" size="sm" onclick={deactivate}>Nonaktifkan</Button>
			{:else}
				<Button variant="primary" size="sm" {loading} onclick={activate}>Aktifkan</Button>
			{/if}
		</div>
	</div>
{:else}
	<!-- List card -->
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
				{#if admin && extension.isInstalled}<Badge tone="success">Installed</Badge>{/if}
				{#if !admin && isActive}<Badge tone="accent">Aktif</Badge>{/if}
				{#if extension.isNsfw}<Badge tone="danger">18+</Badge>{/if}
				{#if admin && extension.hasUpdate}<Badge tone="accent">Update</Badge>{/if}
			</div>
			<div class="mt-1 flex items-center gap-3 text-sm text-muted">
				<span>{#if admin}v{extension.versionName} · {/if}{langDisplay(extension.lang)}</span>
				{#if admin && activationCount}
					<span class="flex items-center gap-1">
						<Users size={12} />
						{activationCount}
					</span>
				{/if}
			</div>
			{#if error}<p class="mt-1 text-xs text-danger">{error}</p>{/if}
		</div>

		<div class="flex shrink-0 flex-wrap justify-end gap-2">
			{#if admin}
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
			{:else if isActive}
				<Button variant="secondary" size="sm" onclick={deactivate}>Nonaktifkan</Button>
			{:else}
				<Button variant="primary" size="sm" {loading} onclick={activate}>Aktifkan</Button>
			{/if}
		</div>
	</div>
{/if}
