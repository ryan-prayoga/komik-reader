import { getDb } from './db';

export type IncomingChange = {
	entity: string;
	itemKey: string;
	data: unknown;
	updatedAt: number;
	deleted: boolean;
};

export type SyncResult = {
	changes: IncomingChange[];
	cursor: number;
};

const VALID_ENTITIES = new Set(['history', 'library', 'categories', 'readtime']);

// Per-row payload ceiling. A history/library/category row is small metadata; a
// legit one is well under 1KB. Cap protects auth.db from a malformed or hostile
// client bloating the sync table.
const MAX_DATA_BYTES = 32 * 1024;

/**
 * Apply a batch of client changes (last-write-wins by updatedAt) and return the
 * changefeed of all the user's rows newer than `since` (per-user seq cursor).
 */
export function syncChanges(
	userId: number,
	since: number,
	changes: IncomingChange[]
): SyncResult {
	const db = getDb();

	const getMaxSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM user_sync WHERE user_id = ?');
	const getExisting = db.prepare(
		'SELECT updated_at FROM user_sync WHERE user_id = ? AND entity = ? AND item_key = ?'
	);
	const upsert = db.prepare(`
		INSERT INTO user_sync (user_id, entity, item_key, data, updated_at, deleted, seq)
		VALUES (@user_id, @entity, @item_key, @data, @updated_at, @deleted, @seq)
		ON CONFLICT(user_id, entity, item_key) DO UPDATE SET
			data = @data, updated_at = @updated_at, deleted = @deleted, seq = @seq
	`);
	const pull = db.prepare(
		'SELECT entity, item_key, data, updated_at, deleted, seq FROM user_sync WHERE user_id = ? AND seq > ? ORDER BY seq'
	);

	const run = db.transaction(() => {
		let seq = (getMaxSeq.get(userId) as { m: number }).m;
		for (const c of changes) {
			if (!VALID_ENTITIES.has(c.entity) || typeof c.itemKey !== 'string') continue;
			const serialized = JSON.stringify(c.data ?? null);
			if (serialized.length > MAX_DATA_BYTES) continue;
			const ex = getExisting.get(userId, c.entity, c.itemKey) as
				| { updated_at: number }
				| undefined;
			// Skip stale or duplicate writes — keep the freshest by updatedAt.
			if (ex && ex.updated_at >= c.updatedAt) continue;
			seq += 1;
			upsert.run({
				user_id: userId,
				entity: c.entity,
				item_key: c.itemKey,
				data: serialized,
				updated_at: c.updatedAt,
				deleted: c.deleted ? 1 : 0,
				seq
			});
		}

		const rows = pull.all(userId, since) as {
			entity: string;
			item_key: string;
			data: string;
			updated_at: number;
			deleted: number;
			seq: number;
		}[];
		const cursor = rows.length ? rows[rows.length - 1].seq : since;
		return { rows, cursor };
	});

	const { rows, cursor } = run();
	return {
		changes: rows.map((r) => ({
			entity: r.entity,
			itemKey: r.item_key,
			data: JSON.parse(r.data),
			updatedAt: r.updated_at,
			deleted: r.deleted === 1
		})),
		cursor
	};
}
