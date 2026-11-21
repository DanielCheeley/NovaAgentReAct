import Database from "better-sqlite3";
import path from "node:path";

export const databasePath = path.resolve(
  process.env.NOVA_DATABASE_PATH ?? "data/nova.db"
);

export const db = new Database(databasePath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    normalized_content TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    conversation_id INTEGER NOT NULL,
    account TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS episode_reviews (
    conversation_id INTEGER NOT NULL,
    first_message_id INTEGER NOT NULL,
    last_message_id INTEGER NOT NULL,
    source_hash TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, first_message_id, last_message_id)
  );

  CREATE TABLE IF NOT EXISTS forgotten_episode_sources (message_id INTEGER PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS forgotten_preference_topics (digest TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS idle_review_start (id INTEGER PRIMARY KEY CHECK(id = 1), message_id INTEGER NOT NULL);

  CREATE TABLE IF NOT EXISTS preference_review_progress (
    id INTEGER PRIMARY KEY CHECK(id = 1), episode_id INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS preference_conflicts (
    topic TEXT PRIMARY KEY REFERENCES learned_preferences(topic) ON DELETE CASCADE ON UPDATE CASCADE,
    episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS learned_preferences (
    topic TEXT PRIMARY KEY,
    evidence_ids TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    conversation_id INTEGER NOT NULL,
    task TEXT NOT NULL,
    run_at TEXT NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    tool_call_id TEXT,
    tool_name TEXT,
    tool_calls TEXT,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  CREATE TABLE IF NOT EXISTS memory_informed_replies (
    message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE
  );
`);

// Add semantic metadata atomically while retaining existing facts and IDs.
db.transaction(() => {
  const columns = new Set(
    (db.prepare("PRAGMA table_info(memories)").all() as { name: string }[]).map(
      ({ name }) => name
    )
  );
  for (const [name, definition] of [
    [
      "subject",
      "TEXT NOT NULL DEFAULT 'user' CHECK (subject IN ('user', 'nova'))"
    ],
    [
      "status",
      "TEXT NOT NULL DEFAULT 'established' CHECK (status IN ('tentative', 'established'))"
    ],
    [
      "origin",
      "TEXT NOT NULL DEFAULT 'legacy' CHECK (origin IN ('legacy', 'explicit'))"
    ],
    ["updated_at", "TEXT"]
  ]) {
    if (!columns.has(name))
      db.exec(`ALTER TABLE memories ADD COLUMN ${name} ${definition}`);
  }
  db.exec(
    "UPDATE memories SET updated_at = created_at WHERE updated_at IS NULL"
  );
}).immediate();
