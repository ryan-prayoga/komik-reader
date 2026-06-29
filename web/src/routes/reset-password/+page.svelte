<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let loading = $state(false);
</script>

<div class="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
	<div class="rounded-2xl border border-border bg-surface p-8">
		<h1 class="text-2xl font-semibold">Reset Password</h1>
		<p class="mt-1 text-sm text-muted">Masukkan password baru kamu.</p>

		{#if !data.hasToken}
			<div class="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
				Link reset tidak valid. Minta link baru di
				<a href="/forgot-password" class="underline">Lupa Password</a>.
			</div>
		{:else}
			<form
				class="mt-6 space-y-4"
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
					<div class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
						{form.error}
					</div>
				{/if}

				<label class="block">
					<span class="text-sm text-muted">Password baru</span>
					<input
						name="password"
						type="password"
						autocomplete="new-password"
						required
						minlength="8"
						class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
					/>
				</label>

				<label class="block">
					<span class="text-sm text-muted">Konfirmasi password</span>
					<input
						name="confirm"
						type="password"
						autocomplete="new-password"
						required
						minlength="8"
						class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
					/>
				</label>

				<button
					type="submit"
					disabled={loading}
					class="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
				>
					{loading ? 'Menyimpan...' : 'Simpan password'}
				</button>
			</form>
		{/if}
	</div>
</div>