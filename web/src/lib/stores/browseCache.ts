import type { BrowseManga, FetchMangaType, FilterChangeInput } from '$lib/graphql/types';

// In-memory snapshot of a browse listing so returning from a manga detail
// (which remounts the route via the layout's {#key pathname}) restores the
// scrolled-through grid instead of refetching from page 1. Keyed by sourceId —
// one live snapshot per source is enough for the common back-and-forth flow.
export type BrowseSnapshot = {
	sourceId: string;
	tab: FetchMangaType;
	activeSearch: string;
	mangas: BrowseManga[];
	pageNum: number;
	hasNext: boolean;
	scrollY: number;
	appliedFilters: FilterChangeInput[];
};

const snapshots = new Map<string, BrowseSnapshot>();

export function saveBrowseSnapshot(snap: BrowseSnapshot) {
	snapshots.set(snap.sourceId, snap);
}

export function getBrowseSnapshot(sourceId: string): BrowseSnapshot | null {
	return snapshots.get(sourceId) ?? null;
}

export function clearBrowseSnapshot(sourceId: string) {
	snapshots.delete(sourceId);
}
