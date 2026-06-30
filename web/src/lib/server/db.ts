import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { bootstrapAdmin, dbPath } from './env';
import { hashPassword } from './password';

let db: Database.Database | null = null;

export type UserRow = {
	id: number;
	email: string;
	username: string;
	password_hash: string;
	is_admin: number;
	created_at: string;
};

function columnExists(database: Database.Database, table: string, column: string): boolean {
	const cols = database.pragma(`table_info(${table})`) as { name: string }[];
	return cols.some((c) => c.name === column);
}

function migrate(database: Database.Database) {
	database.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL UNIQUE COLLATE NOCASE,
			username TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			is_admin INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			token_hash TEXT NOT NULL UNIQUE,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS password_resets (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			token_hash TEXT NOT NULL UNIQUE,
			expires_at TEXT NOT NULL,
			used_at TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS app_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);

		-- Per-user changefeed for local-first sync (history/library/categories).
		-- seq is a per-user monotonic version so clients can pull incrementally
		-- without depending on wall-clock agreement across devices.
		CREATE TABLE IF NOT EXISTS user_sync (
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			entity TEXT NOT NULL,
			item_key TEXT NOT NULL,
			data TEXT NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted INTEGER NOT NULL DEFAULT 0,
			seq INTEGER NOT NULL,
			PRIMARY KEY (user_id, entity, item_key)
		);

		CREATE TABLE IF NOT EXISTS extension_activations (
			pkg_name TEXT PRIMARY KEY,
			count INTEGER NOT NULL DEFAULT 0
		);

		CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
		CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);
		CREATE INDEX IF NOT EXISTS idx_user_sync_seq ON user_sync(user_id, seq);
	`);

	if (!columnExists(database, 'users', 'is_admin')) {
		database.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
	}

	const adminCount = database
		.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1')
		.get() as { c: number };
	if (adminCount.c === 0) {
		const users = database.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
		if (users.c > 0) {
			database
				.prepare('UPDATE users SET is_admin = 1 WHERE id = (SELECT MIN(id) FROM users)')
				.run();
		}
	}
}

function seedAdmin(database: Database.Database) {
	const count = database.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
	if (count.c > 0) return;

	const admin = bootstrapAdmin();
	if (!admin.email || !admin.password) return;

	database
		.prepare('INSERT INTO users (email, username, password_hash, is_admin) VALUES (?, ?, ?, 1)')
		.run(admin.email, admin.username, hashPassword(admin.password));
}

export function getDb(): Database.Database {
	if (db) return db;

	const path = dbPath();
	mkdirSync(dirname(path), { recursive: true });

	db = new Database(path);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	migrate(db);
	seedAdmin(db);
	return db;
}