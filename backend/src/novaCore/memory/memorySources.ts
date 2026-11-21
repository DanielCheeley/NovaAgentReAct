import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { db, databasePath } from "../../database/database";
import { episodeContext } from "./episodeStore";
import { preferenceContext } from "./learnPreference";
import { memoryContext } from "./longTermMemoryStore";

type MemorySource = "Web app" | "Discord";
let localSource: MemorySource = "Web app";
let peerPath: string | undefined;
let peer: Database.Database | undefined;

export function configureMemorySources(source: MemorySource, path?: string) {
  peer?.close();
  peer = undefined;
  localSource = source;
  peerPath = path !== databasePath ? path : undefined;
}

function peerDatabase() {
  if (peer || !peerPath || !existsSync(peerPath)) return peer;
  const candidate = new Database(peerPath, { readonly: true, fileMustExist: true });
  // The other process may be opening a new database at the same time.
  const columns = candidate.pragma("table_info(memories)") as { name: string }[];
  if (!columns.some(({ name }) => name === "updated_at")) {
    candidate.close();
    return undefined;
  }
  peer = candidate;
  return peer;
}

export function sharedMemoryContext(query: string) {
  const overview = /\b(?:what (?:do|did|can) you (?:remember|recall|learn)|what (?:saved )?memories do you have|(?:show|list)(?: me)? (?:your |the )?(?:saved )?memories)\s*(?:(?:from|on|in) (discord|(?:the )?web(?: app)?))?\s*[.!?]*\s*$/i.exec(query);
  const sourceName = overview?.[1]?.toLowerCase();
  const requestedSource = sourceName === "discord" ? "Discord" : sourceName ? "Web app" : undefined;
  const sources = [{ source: localSource, database: db }];
  const other = peerDatabase();
  if (other) {
    sources.push({
      source: localSource === "Web app" ? "Discord" : "Web app",
      database: other
    });
  }
  const sections: string[] = [];
  let hasRecall = false;
  for (const { source, database } of sources) {
    if (requestedSource && requestedSource !== source) continue;
    const recalled = [
      preferenceContext(query, database, Boolean(overview)),
      episodeContext(query, database, Boolean(overview))
    ]
      .filter(Boolean);
    if (recalled.length) hasRecall = true;
    const context = [memoryContext(database), ...recalled].filter(Boolean);
    if (context.length) sections.push(`Memory source: ${source}\n${context.join("\n")}`);
  }
  return {
    memory: sections.length
      ? [
          "These are memories from your connected apps. Use them to answer explicit memory questions, including questions about the other app. State where each recalled detail came from. IDs are local to each source. Attribute memories to their original speakers; a fact about a web user does not describe the current Discord speaker.",
          ...sections
        ].join("\n\n")
      : "",
    hasRecall
  };
}
