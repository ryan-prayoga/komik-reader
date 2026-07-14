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
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="redirectTo" value={form?.redirectTo ?? data.redirectTo} />

			{#if form?.error}
				<div
					id="login-error"
					role="alert"
					aria-live="assertive"
					class="rounded-[var(--radius)] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
				>
					{form.error}
				</div>
			{/if}

			<label class="block" for="login-identifier">
				<span class="text-sm font-medium text-text">Email atau username</span>
				<input
					id="login-identifier"
					name="login"
					type="text"
					autocomplete="username"
					value={form?.login ?? ''}
					required
					class={field}
					aria-invalid={!!form?.error}
					aria-describedby={form?.error ? 'login-error' : undefined}
				/>
			</label>

			<div class="block">
				<label class="text-sm font-medium text-text" for="login-password">Password</label>
				<div class="relative">
					<input
						id="login-password"
						name="password"
						type={showPassword ? 'text' : 'password'}
						autocomplete="current-password"
						required
						class="{field} pr-10"
						aria-invalid={!!form?.error}
						aria-describedby={form?.error ? 'login-error' : undefined}
					/>
					<button
						type="button"
						class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted transition hover:text-text"
						aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
						aria-controls="login-password"
						onclick={() => (showPassword = !showPassword)}
					>
						{#if showPassword}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
					</button>
				</div>
			</div>

			<Button type="submit" block {loading}>Masuk</Button>
		</form>

	<div class="mt-4 flex flex-wrap justify-between gap-2 text-sm">
		<a href="/forgot-password" class="text-accent hover:underline">Lupa password?</a>
		{#if data.canRegister}
			<a href="/register" class="text-muted transition hover:text-accent">Daftar akun</a>
		{/if}
	</div>
</AuthShell>
