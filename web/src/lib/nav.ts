import type { Component } from 'svelte';
import House from '@lucide/svelte/icons/house';
import LibraryBig from '@lucide/svelte/icons/library-big';
import Search from '@lucide/svelte/icons/search';
import History from '@lucide/svelte/icons/history';
import Puzzle from '@lucide/svelte/icons/puzzle';
import Download from '@lucide/svelte/icons/download';
import Settings from '@lucide/svelte/icons/settings';
import Shield from '@lucide/svelte/icons/shield';
import BarChart3 from '@lucide/svelte/icons/bar-chart-3';

export interface NavItem {
	href: string;
	label: string;
	icon: Component;
}

/** Top-level destinations — also the mobile bottom-nav slots. */
export const primaryNav: NavItem[] = [
	{ href: '/', label: 'Beranda', icon: House },
	{ href: '/library', label: 'Library', icon: LibraryBig },
	{ href: '/search', label: 'Cari', icon: Search },
	{ href: '/history', label: 'Riwayat', icon: History }
];

/** Secondary destinations — sidebar lower section + mobile "More" sheet. */
export const manageNav: NavItem[] = [
	{ href: '/stats', label: 'Statistik', icon: BarChart3 },
	{ href: '/extensions', label: 'Extensions', icon: Puzzle },
	{ href: '/downloads', label: 'Unduhan', icon: Download },
	{ href: '/settings', label: 'Pengaturan', icon: Settings }
];

export const adminNav: NavItem = { href: '/admin', label: 'Admin', icon: Shield };

/** True when `pathname` is the item route or a child of it. */
export function isActive(pathname: string, href: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(href + '/');
}
