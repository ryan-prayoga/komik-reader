<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, Badge, Modal } from '$lib/components/ui';

	let { data, form } = $props();
	let loading = $state<string | null>(null);
	let resetUserId = $state<number | null>(null);
	let deleteOpen = $state(false);
	let pendingDelete = $state<{ id: number; username: string } | null>(null);
	let deleteFormEl = $state<HTMLFormElement | null>(null);

	const field =
		'mt-1 w-full rounded-[var(--radius)] border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition focus:border-accent';

	function askDelete(id: number, username: string) {
		pendingDelete = { id, username };
		deleteOpen = true;
	}

	function confirmDelete() {
		if (!pendingDelete || !deleteFormEl) return;
		deleteFormEl.requestSubmit();
		deleteOpen = false;
	}
</script>

{#if form?.success}
	<div class="mb-4 rounded-[var(--radius)] border border-success/30 bg-success/10 p-3 text-sm text-success">
		{form.success}
	</div>
{/if}
{#if form?.error}
	<div class="mb-4 rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
		{form.error}
	</div>
{/if}

<Card padding="lg" class="mb-8">
	<h2 class="mb-4 text-lg font-semibold text-text">Buat Akun Baru</h2>
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
			<span class="text-sm font-medium text-text">Email</span>
			<input name="email" type="email" required class={field} />
		</label>
		<label class="block">
			<span class="text-sm font-medium text-text">Username</span>
			<input name="username" type="text" required minlength="3" class={field} />
		</label>
		<label class="block">
			<span class="text-sm font-medium text-text">Password</span>
			<input name="password" type="password" required minlength="8" class={field} />
		</label>
		<label class="flex items-end gap-2 pb-2">
			<input name="is_admin" type="checkbox" class="h-4 w-4 accent-accent" />
			<span class="text-sm text-text">Jadikan admin</span>
		</label>
		<div class="sm:col-span-2">
			<Button type="submit" loading={loading === 'create'}>Buat akun</Button>
		</div>
	</form>
</Card>

<Card padding="lg">
	<h2 class="mb-4 text-lg font-semibold text-text">Daftar Akun ({data.users.length})</h2>

	<div class="space-y-3">
		{#each data.users as user (user.id)}
			<div class="rounded-[var(--radius)] border border-border bg-bg p-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="flex flex-wrap items-center gap-2 font-medium text-text">
							{user.username}
							{#if user.is_admin}<Badge tone="accent">Admin</Badge>{/if}
							{#if user.id === data.currentUserId}<span class="text-xs text-muted">(kamu)</span>{/if}
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
								<Button variant="secondary" size="sm" type="submit">
									{user.is_admin ? 'Cabut admin' : 'Jadikan admin'}
								</Button>
							</form>
						{/if}

						<Button
							variant="secondary"
							size="sm"
							onclick={() => (resetUserId = resetUserId === user.id ? null : user.id)}
						>
							Reset password
						</Button>

						{#if user.id !== data.currentUserId}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => askDelete(user.id, user.username)}
							>
								Hapus
							</Button>
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
							<input name="password" type="password" required minlength="8" class={field} />
						</label>
						<Button type="submit" loading={loading === `reset-${user.id}`}>Simpan</Button>
					</form>
				{/if}
			</div>
		{/each}
	</div>
</Card>

<form
	bind:this={deleteFormEl}
	method="POST"
	action="?/delete"
	class="hidden"
	use:enhance={() => {
		loading = 'delete';
		return async ({ update }) => {
			loading = null;
			pendingDelete = null;
			await update();
		};
	}}
>
	<input type="hidden" name="user_id" value={pendingDelete?.id ?? ''} />
</form>

<Modal bind:open={deleteOpen} title="Hapus akun?">
	<p class="text-sm text-muted">
		Akun "{pendingDelete?.username ?? ''}" akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
	</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (deleteOpen = false)}>Batal</Button>
		<Button variant="danger" loading={loading === 'delete'} onclick={confirmDelete}>Hapus</Button>
	{/snippet}
</Modal>
