<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';

	let { data, form } = $props();
	let loading = $state(false);
	let showPassword = $state(false);

	const field =
		'mt-1 w-full rounded-[var(--radius)] border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition placeholder:text-muted focus:border-accent';
</script>

<AuthShell title="Masuk" subtitle="Email atau username + password">
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
		<input type="hidden" name="redirectTo" value={form?.redirectTo ?? data.redirectTo} />

		{#if form?.error}
			<div class="rounded-[var(--radius)] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
				{form.error}
			</div>
		{/if}

		<label class="block">
			<span class="text-sm font-medium text-text">Email atau username</span>
			<input name="login" type="text" autocomplete="username" value={form?.login ?? ''} required class={field} />
		</label>

		<label class="block">
			<span class="text-sm font-medium text-text">Password</span>
			<div class="relative">
				<input
					name="password"
					type={showPassword ? 'text' : 'password'}
					autocomplete="current-password"
					required
					class="{field} pr-10"
				/>
				<button
					type="button"
					class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted transition hover:text-text"
					aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
					onclick={() => (showPassword = !showPassword)}
				>
					{#if showPassword}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
				</button>
			</div>
		</label>

		<Button type="submit" block {loading}>Masuk</Button>
	</form>

	<div class="mt-4 flex flex-wrap justify-between gap-2 text-sm">
		<a href="/forgot-password" class="text-accent hover:underline">Lupa password?</a>
		{#if data.canRegister}
			<a href="/register" class="text-muted transition hover:text-accent">Daftar akun</a>
		{/if}
	</div>
</AuthShell>
