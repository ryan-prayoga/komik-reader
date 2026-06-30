type CachedDetail = {
	status: string;
	genre: string[];
	latestUploadedChapter: { name: string; chapterNumber: number; uploadDate: string } | null;
	chaptersChecked: boolean;
	ts: number;
};

const TTL = 30 * 60 * 1000;
const cache = new Map<number, CachedDetail>();

export function getCached(id: number): CachedDetail | null {
	const e = cache.get(id);
	if (!e) return null;
	if (Date.now() - e.ts > TTL) { cache.delete(id); return null; }
	return e;
}

export function setCache(id: number, d: Omit<CachedDetail, 'ts'>) {
	cache.set(id, { ...d, ts: Date.now() });
}

export function getMissingIds(ids: number[]): number[] {
	return ids.filter(id => !getCached(id));
}
