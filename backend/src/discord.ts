import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { discordChannelId, discordDatabasePath, readEnvFile } from "./database/discordDatabase";
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageType,
  type Message
} from "discord.js";

const novaName = /(?<![\p{L}\p{M}\p{N}\p{Pc}])nova(?![\p{L}\p{M}\p{N}\p{Pc}])/iu;

function requiredSetting(name: string, valid: (value: string) => boolean) {
  const value = process.env[name]?.trim();
  if (!value || !valid(value)) {
    throw new Error(`Set a valid ${name} in backend/.env or backend/.env.discord.`);
  }
  return value;
}

async function main() {
  const webDatabase = resolve(
    process.env.NOVA_DATABASE_PATH ?? readEnvFile(".env").NOVA_DATABASE_PATH ?? "data/nova.db"
  );
  // Existing environment variables win, then the Discord-specific file.
  for (const file of [".env.discord", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }

  const token = requiredSetting("DISCORD_BOT_TOKEN", Boolean);
  const channelId = discordChannelId();
  const channelDatabase = discordDatabasePath(channelId);
  if (!channelDatabase) {
    throw new Error("Set a valid DISCORD_CHANNEL_ID in backend/.env or backend/.env.discord.");
  }

  // Set the prototype database before Nova's modules open SQLite.
  const dataDirectory = resolve("data");
  mkdirSync(dataDirectory, { recursive: true });
  process.env.NOVA_DATABASE_PATH = channelDatabase;
  const { handleMessage } = await import("./novaCore/agent");
  const { startIdleMemoryReview } = await import("./novaCore/memory/idleMemoryReview");
  const { configureMemorySources } = await import("./novaCore/memory/memorySources");
  configureMemorySources("Discord", webDatabase);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    allowedMentions: { parse: [], repliedUser: false }
  });
  const conversationId = 1;
  let responding = false;

  async function reply(message: Message, content: string) {
    // Discord limits each message to 2,000 characters. Keep surrogate pairs intact.
    while (content.length > 0) {
      let end = Math.min(content.length, 2000);
      if (end < content.length && /[\uD800-\uDBFF]/.test(content[end - 1])) end--;
      await message.reply(content.slice(0, end));
      content = content.slice(end);
    }
  }

  client.once(Events.ClientReady, ({ user }) => {
    console.log(`Connected to Discord as ${user.tag}. Listening in channel ${channelId}.`);
  });
  client.on(Events.Error, () => console.error("Discord client encountered an error."));
  client.on(Events.MessageCreate, async (message) => {
    const botId = client.user?.id;
    if (
      !botId ||
      message.channelId !== channelId ||
      message.author.bot ||
      message.webhookId
    ) return;

    const mention = new RegExp(`<@!?${botId}>`, "g");
    const incoming = message.content.replace(mention, "Nova").trim();
    if (!incoming) return;
    const original = message.type === MessageType.Reply && message.reference?.messageId
      ? await message.fetchReference().catch(() => null)
      : null;
    const replyToNova = original?.author.id === botId ? original : null;
    if (!replyToNova && !novaName.test(incoming)) return;

    const latestMessage = `${message.author.username}: ${incoming}`;
    const prompt = replyToNova
      ? `Replying to Nova's message: ${JSON.stringify(replyToNova.content)}\n${latestMessage}`
      : latestMessage;

    try {
      if (responding) {
        await reply(message, "I'm still answering your previous message.");
        return;
      }

      responding = true;
      try {
        let content: string;
        try {
          const recentMessages = await message.channel.messages
            .fetch({ before: message.id, limit: 12, cache: false })
            .catch(() => null);
          const recentChannelContext = recentMessages
            ? [...recentMessages.values()]
                .reverse()
                .filter((entry) => entry.content.trim() && entry.id !== replyToNova?.id)
                .map((entry) => ({
                  speaker: entry.author.id === botId ? "Nova" : entry.author.username,
                  text: entry.content.replace(mention, "Nova").trim().slice(0, 500)
                }))
            : [];
          const result = await handleMessage(conversationId, prompt, {
            chatOnly: true,
            recallChannelMemory: true,
            recentChannelContext,
            signal: AbortSignal.timeout(120_000)
          });
          content = result.cancelled
            ? "I ran out of time. Please try again."
            : result.response;
        } catch {
          console.error("Nova could not generate a Discord reply.");
          content = "I couldn't finish that reply. Please check that Ollama is running and try again.";
        }
        await reply(message, content);
      } finally {
        responding = false;
      }
    } catch {
      console.error("Could not send Nova's Discord reply. Check the bot's channel permissions.");
    }
  });

  startIdleMemoryReview();
  try {
    await client.login(token);
  } catch (error) {
    await client.destroy();
    if (error instanceof Error && error.message === "Used disallowed intents") {
      throw new Error("Enable Message Content Intent under Bot in the Discord Developer Portal, then restart Nova.");
    }
    throw new Error("Discord login failed. Check DISCORD_BOT_TOKEN and network access.");
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Nova's Discord bot failed to start.");
  process.exitCode = 1;
});
