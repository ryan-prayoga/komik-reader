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
	created_at: string;
};

function migrate(database: Database.Database) {
	database.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL UNIQUE COLLATE NOCASE,
			username TEXT NOT NULL,
			password_hash TEXT NOT NULL,
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

		CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
		CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);
	`);
}

function seedAdmin(database: Database.Database) {
	const count = database.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
	if (count.c > 0) return;

	const admin = bootstrapAdmin();
	if (!admin.email || !admin.password) return;

	database
		.prepare('INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)')
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