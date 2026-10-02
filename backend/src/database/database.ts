import Database from "better-sqlite3";
import path from "node:path";

const databasePath = path.resolve("data/nova.db");

export const db = new Database(databasePath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    conversation_id INTEGER NOT NULL,
    task TEXT NOT NULL,
    run_at TEXT NOT NULL,
    status TEXT NOT NULL
  );
`);