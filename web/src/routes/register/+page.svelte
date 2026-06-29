<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui';

	let { data, form } = $props();
	let loading = $state(false);

	const field =
		'mt-1 w-full rounded-[var(--radius)] border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition placeholder:text-muted focus:border-accent';
</script>

<AuthShell
	title="Daftar"
	subtitle={data.firstUser
		? 'Buat akun admin pertama untuk Komik Reader.'
		: 'Buat akun baru dengan email dan username.'}
>
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

		<label class="block">
			<span class="text-sm font-medium text-text">Username</span>
			<input name="username" type="text" autocomplete="username" value={form?.username ?? ''} required minlength="3" class={field} />
		</label>

		<label class="block">
			<span class="text-sm font-medium text-text">Password</span>
			<input name="password" type="password" autocomplete="new-password" required minlength="8" class={field} />
		</label>

		<label class="block">
			<span class="text-sm font-medium text-text">Konfirmasi password</span>
			<input name="confirm" type="password" autocomplete="new-password" required minlength="8" class={field} />
		</label>

		<Button type="submit" block {loading}>Daftar</Button>
	</form>

	{#snippet footer()}
		Sudah punya akun? <a href="/login" class="text-accent hover:underline">Masuk</a>
	{/snippet}
</AuthShell>
