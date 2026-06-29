<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui';

	let { form } = $props();
	let loading = $state(false);

	const field =
		'mt-1 w-full rounded-[var(--radius)] border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition placeholder:text-muted focus:border-accent';
</script>

<AuthShell title="Lupa Password" subtitle="Kami akan kirim link reset ke email kamu.">
	{#if form?.success}
		<div class="rounded-[var(--radius)] border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
			Jika email terdaftar, link reset sudah dikirim ke <strong>{form.email}</strong>.
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
			{#if form?.error}
				<div class="rounded-[var(--radius)] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
					{form.error}
				</div>
			{/if}

			<label class="block">
				<span class="text-sm font-medium text-text">Email</span>
				<input name="email" type="email" autocomplete="email" value={form?.email ?? ''} required class={field} />
			</label>

			<Button type="submit" block {loading}>Kirim link reset</Button>
		</form>
	{/if}

	{#snippet footer()}
		<a href="/login" class="text-accent hover:underline">← Kembali ke login</a>
	{/snippet}
</AuthShell>
