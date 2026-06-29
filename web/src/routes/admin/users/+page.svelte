<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let loading = $state<string | null>(null);
	let resetUserId = $state<number | null>(null);
</script>

{#if form?.success}
	<div class="mb-4 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
		{form.success}
	</div>
{/if}
{#if form?.error}
	<div class="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
		{form.error}
	</div>
{/if}

<section class="mb-8 rounded-xl border border-border bg-surface p-5">
	<h2 class="mb-4 text-lg font-medium">Buat Akun Baru</h2>
	<form
		method="POST"
		action="?/create"
		class="grid gap-4 sm:grid-cols-2"
		use:enhance={() => {
			loading = 'create';
			return async ({ update }) => {
				loading = null;
				await update();
			};
		}}
	>
		<label class="block">
			<span class="text-sm text-muted">Email</span>
			<input
				name="email"
				type="email"
				required
				class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
			/>
		</label>
		<label class="block">
			<span class="text-sm text-muted">Username</span>
			<input
				name="username"
				type="text"
				required
				minlength="3"
				class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
			/>
		</label>
		<label class="block">
			<span class="text-sm text-muted">Password</span>
			<input
				name="password"
				type="password"
				required
				minlength="8"
				class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
			/>
		</label>
		<label class="flex items-end gap-2 pb-2">
			<input name="is_admin" type="checkbox" class="accent-accent" />
			<span class="text-sm">Jadikan admin</span>
		</label>
		<div class="sm:col-span-2">
			<button
				type="submit"
				disabled={loading === 'create'}
				class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
			>
				{loading === 'create' ? 'Membuat...' : 'Buat akun'}
			</button>
		</div>
	</form>
</section>

<section class="rounded-xl border border-border bg-surface p-5">
	<h2 class="mb-4 text-lg font-medium">Daftar Akun ({data.users.length})</h2>

	<div class="space-y-3">
		{#each data.users as user (user.id)}
			<div class="rounded-lg border border-border bg-bg p-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p class="font-medium">
							{user.username}
							{#if user.is_admin}
								<span class="ml-2 rounded bg-accent/20 px-2 py-0.5 text-xs text-accent">Admin</span>
							{/if}
							{#if user.id === data.currentUserId}
								<span class="ml-1 text-xs text-muted">(kamu)</span>
							{/if}
						</p>
						<p class="text-sm text-muted">{user.email}</p>
						<p class="mt-1 text-xs text-muted">
							Dibuat {new Date(user.created_at + 'Z').toLocaleString('id-ID')}
						</p>
					</div>

					<div class="flex flex-wrap gap-2">
						{#if user.id !== data.currentUserId}
							<form method="POST" action="?/toggleAdmin" use:enhance>
								<input type="hidden" name="user_id" value={user.id} />
								<input type="hidden" name="make_admin" value={user.is_admin ? 'false' : 'true'} />
								<button
									type="submit"
									class="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent hover:text-accent"
								>
									{user.is_admin ? 'Cabut admin' : 'Jadikan admin'}
								</button>
							</form>
						{/if}

						<button
							type="button"
							class="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent hover:text-accent"
							onclick={() => (resetUserId = resetUserId === user.id ? null : user.id)}
						>
							Reset password
						</button>

						{#if user.id !== data.currentUserId}
							<form
								method="POST"
								action="?/delete"
								use:enhance={({ cancel }) => {
									if (!confirm(`Hapus akun ${user.username}?`)) cancel();
								}}
							>
								<input type="hidden" name="user_id" value={user.id} />
								<button
									type="submit"
									class="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-danger hover:text-danger"
								>
									Hapus
								</button>
							</form>
						{/if}
					</div>
				</div>

				{#if resetUserId === user.id}
					<form
						method="POST"
						action="?/resetPassword"
						class="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4"
						use:enhance={() => {
							loading = `reset-${user.id}`;
							return async ({ update }) => {
								loading = null;
								resetUserId = null;
								await update();
							};
						}}
					>
						<input type="hidden" name="user_id" value={user.id} />
						<label class="min-w-[200px] flex-1">
							<span class="text-xs text-muted">Password baru</span>
							<input
								name="password"
								type="password"
								required
								minlength="8"
								class="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
							/>
						</label>
						<button
							type="submit"
							disabled={loading === `reset-${user.id}`}
							class="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:bg-accent-hover disabled:opacity-50"
						>
							Simpan
						</button>
					</form>
				{/if}
			</div>
		{/each}
	</div>
</section>