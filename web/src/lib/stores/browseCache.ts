import type { BrowseManga, FetchMangaType, FilterChangeInput } from '$lib/graphql/types';

// In-memory snapshot of a browse listing so returning from a manga detail
// (which remounts the route via the layout's {#key pathname}) restores the
// scrolled-through grid instead of refetching from page 1. Keyed by sourceId —
// one live snapshot per source is enough for the common back-and-forth flow.
// Snapshots expire after TTL_MS so a stale list (e.g. missing a newly
// uploaded chapter) doesn't get reused forever within the same session.
export type BrowseSnapshot = {
	sourceId: string;
	tab: FetchMangaType;
	activeSearch: string;
	mangas: BrowseManga[];
	pageNum: number;
	hasNext: boolean;
	scrollY: number;
	appliedFilters: FilterChangeInput[];
	ts: number;
};

const TTL_MS = 5 * 60 * 1000;

const snapshots = new Map<string, BrowseSnapshot>();

export function saveBrowseSnapshot(snap: Omit<BrowseSnapshot, 'ts'>) {
	snapshots.set(snap.sourceId, { ...snap, ts: Date.now() });
}

export function getBrowseSnapshot(sourceId: string): BrowseSnapshot | null {
	const snap = snapshots.get(sourceId);
	if (!snap) return null;
	if (Date.now() - snap.ts > TTL_MS) {
		snapshots.delete(sourceId);
		return null;
	}
	return snap;
}

export function clearBrowseSnapshot(sourceId: string) {
	snapshots.delete(sourceId);
}
