<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui';

	let { data, form } = $props();
	let loading = $state(false);

	const field =
		'mt-1 w-full rounded-[var(--radius)] border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition placeholder:text-muted focus:border-accent';
</script>

<AuthShell title="Reset Password" subtitle="Masukkan password baru kamu.">
	{#if !data.hasToken}
		<div class="rounded-[var(--radius)] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
			Link reset tidak valid. Minta link baru di
			<a href="/forgot-password" class="underline">Lupa Password</a>.
		</div>
	{:else}
		<form
			class="space-y-4"
			method="POST"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
		>
			<input type="hidden" name="token" value={form?.token ?? data.token} />

			{#if form?.error}
				<div class="rounded-[var(--radius)] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
					{form.error}
				</div>
			{/if}

			<label class="block">
				<span class="text-sm font-medium text-text">Password baru</span>
				<input name="password" type="password" autocomplete="new-password" required minlength="8" class={field} />
			</label>

			<label class="block">
				<span class="text-sm font-medium text-text">Konfirmasi password</span>
				<input name="confirm" type="password" autocomplete="new-password" required minlength="8" class={field} />
			</label>

			<Button type="submit" block {loading}>Simpan password</Button>
		</form>
	{/if}

	{#snippet footer()}
		<a href="/login" class="text-accent hover:underline">← Kembali ke login</a>
	{/snippet}
</AuthShell>
