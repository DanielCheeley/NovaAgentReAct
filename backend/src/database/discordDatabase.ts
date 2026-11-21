import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export function readEnvFile(file: string) {
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
}

export function discordChannelId() {
  return (readEnvFile(".env.discord").DISCORD_CHANNEL_ID ?? process.env.DISCORD_CHANNEL_ID)?.trim();
}

export function discordDatabasePath(channelId: string | undefined) {
  if (!channelId || !/^\d{17,20}$/.test(channelId)) return undefined;
  return resolve("data", `nova-discord-channel-${channelId}.db`);
}
