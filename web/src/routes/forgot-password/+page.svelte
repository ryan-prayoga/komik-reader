<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let loading = $state(false);
</script>

<div class="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
	<div class="rounded-2xl border border-border bg-surface p-8">
		<h1 class="text-2xl font-semibold">Lupa Password</h1>
		<p class="mt-1 text-sm text-muted">Kami akan kirim link reset ke email kamu.</p>

		{#if form?.success}
			<div class="mt-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
				Jika email terdaftar, link reset sudah dikirim ke <strong>{form.email}</strong>.
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
				{#if form?.error}
					<div class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
						{form.error}
					</div>
				{/if}

				<label class="block">
					<span class="text-sm text-muted">Email</span>
					<input
						name="email"
						type="email"
						autocomplete="email"
						value={form?.email ?? ''}
						required
						class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
					/>
				</label>

				<button
					type="submit"
					disabled={loading}
					class="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
				>
					{loading ? 'Mengirim...' : 'Kirim link reset'}
				</button>
			</form>
		{/if}

		<p class="mt-4 text-center text-sm text-muted">
			<a href="/login" class="text-accent hover:underline">← Kembali ke login</a>
		</p>
	</div>
</div>