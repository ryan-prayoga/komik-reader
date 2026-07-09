<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { panelSnap } from '$lib/utils/motion';
	import { preferences } from '$lib/preferences.svelte';
	import { localData } from '$lib/local/data.svelte';
	import { syncEngine } from '$lib/local/sync.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import UpdatePrompt from '$lib/components/UpdatePrompt.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import Sidebar from '$lib/components/nav/Sidebar.svelte';
	import BottomNav from '$lib/components/nav/BottomNav.svelte';
	import MobileTopBar from '$lib/components/nav/MobileTopBar.svelte';
	import MoreSheet from '$lib/components/nav/MoreSheet.svelte';
	import ContinueReadingRail from '$lib/components/nav/ContinueReadingRail.svelte';
	import KeyboardShortcuts from '$lib/components/nav/KeyboardShortcuts.svelte';

	let { data, children } = $props();

	let moreOpen = $state(false);

	const authPages = ['/login', '/register', '/forgot-password', '/reset-password'];
	const isAuthPage = $derived(authPages.some((p) => $page.url.pathname.startsWith(p)));
	const isReader = $derived($page.url.pathname.startsWith('/read/'));
	// Guests get the full shell when guest-read is enabled.
	const showShell = $derived(
		!isAuthPage && !isReader && (data.authEnabled ? !!data.user || data.allowGuest : true)
	);
	const canLogin = $derived(data.authEnabled && !data.user);

	const themeColor = $derived(
		isReader ? '#000000' : preferences.resolved === 'dark' ? '#0b0a09' : '#ffffff'
	);

	/** Default tab title for static routes; dynamic pages override via their own <svelte:head>. */
	const defaultTitle = $derived.by(() => {
		const path = $page.url.pathname;
		if (path.startsWith('/read/')) return 'Baca · Komik Reader';
		if (path.startsWith('/manga/')) return 'Detail · Komik Reader';
		if (path.startsWith('/browse/')) return 'Jelajahi · Komik Reader';
		if (path.startsWith('/admin')) return 'Admin · Komik Reader';
		const map: Record<string, string> = {
			'/': 'Beranda · Komik Reader',
			'/library': 'Koleksi · Komik Reader',
			'/search': 'Cari · Komik Reader',
			'/history': 'Riwayat · Komik Reader',
			'/stats': 'Statistik · Komik Reader',
			'/extensions': 'Ekstensi · Komik Reader',
			'/downloads': 'Unduhan · Komik Reader',
			'/settings': 'Pengaturan · Komik Reader',
			'/login': 'Masuk · Komik Reader',
			'/register': 'Daftar · Komik Reader',
			'/forgot-password': 'Lupa password · Komik Reader',
			'/reset-password': 'Reset password · Komik Reader'
		};
		return map[path] ?? 'Komik Reader';
	});

	onMount(async () => {
		preferences.init();
		await localData.init();
		syncEngine.start(!!data.user);

		// iOS/Android standalone PWAs reopen at whatever path the OS last saw
		// (not the manifest start_url) — redirect that back to Home. But ONLY on a
		// genuine OS cold launch: this mount also runs after in-place reloads
		// (SW autoUpdate's forced reload, WebKit OOM crash recovery, manual
		// refresh), and redirecting those yanked readers out of /read/* to Home
		// mid-chapter. sessionStorage survives same-session reloads but not an OS
		// relaunch, so its absence is the cold-launch signal. The reader is also
		// exempt outright — reopening into a chapter should resume it, never
		// discard it.
		const standalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			(navigator as unknown as { standalone?: boolean }).standalone === true;
		const coldLaunch = !sessionStorage.getItem('komik:launched');
		sessionStorage.setItem('komik:launched', '1');
		if (
			standalone &&
			coldLaunch &&
			$page.url.pathname !== '/' &&
			!$page.url.pathname.startsWith('/read/')
		) {
			goto('/', { replaceState: true });
		}
	});
</script>

<svelte:head>
	<title>{defaultTitle}</title>
	<meta name="theme-color" content={themeColor} />
</svelte:head>

{#if showShell}
	<div class="min-h-screen bg-bg text-text lg:grid lg:grid-cols-[auto_1fr] 2xl:grid-cols-[auto_1fr_auto]">
		<Sidebar user={data.user} {canLogin} />

		<div class="flex min-h-screen min-w-0 flex-col">
			<MobileTopBar />
			<OfflineBanner />
			<main class="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
				{#key $page.url.pathname}
					<div in:panelSnap>
						{@render children()}
					</div>
				{/key}
			</main>
		</div>

		<ContinueReadingRail />
		<KeyboardShortcuts />

		<BottomNav user={data.user} onmore={() => (moreOpen = true)} />
		<MoreSheet bind:open={moreOpen} user={data.user} {canLogin} />
		<InstallPrompt />
		<Toast />
	</div>
{:else if isReader}
	<div class="min-h-screen bg-black text-text">
		{@render children()}
		<Toast />
	</div>
{:else}
	<div class="min-h-screen bg-bg px-4 py-6 text-text">
		{@render children()}
		<Toast />
	</div>
{/if}

{#if !isReader}
	<UpdatePrompt />
{/if}
