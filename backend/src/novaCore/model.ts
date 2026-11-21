import { memoryWriteTools, requestedTurnMemoryWrite, type MemoryWriteTool } from "./memory/memoryIntent";
import { MODEL_CONFIG } from "./novaConfig";
import { NOVA_CONVERSATION_PROMPT, NOVA_SYSTEM_PROMPT } from "./novaPrompt";
import { Message } from "../types/conversationType";
import { discordToolNames, toolDefinitions } from "./tools/toolDefinitions";
import { ModelResponse } from "../types/modelResponseType";
import type { GenerationOptions } from "../types/generationType";
import { requestOllama } from "./providers/ollama";
import { sharedMemoryContext } from "./memory/memorySources";

type ModelRequest = {
  messages: Message[];
  tools?: typeof toolDefinitions;
  stream: boolean;
  think: boolean;
  options: { temperature: number };
};

async function requestModel(
  request: ModelRequest,
  errorLabel: string,
  options: GenerationOptions = {}
): Promise<ModelResponse> {
  return requestOllama(
    MODEL_CONFIG.url,
    { model: MODEL_CONFIG.model, ...request },
    errorLabel,
    options
  );
}

export function generateResponse(
  messages: Message[],
  options: GenerationOptions & {
    chatOnly?: boolean;
    discordTools?: boolean;
    recallChannelMemory?: boolean;
    authorizedMemoryWrite?: MemoryWriteTool | null;
    onRecallContext?: () => void;
  } = {}
): Promise<ModelResponse> {
  const query = messages.findLast((m) => m.role === "user")?.content ?? "";
  const { memory, hasRecall } = options.chatOnly && !options.recallChannelMemory
    ? { memory: "", hasRecall: false }
    : sharedMemoryContext(query);
  if (
    hasRecall ||
    messages.some((m) => m.role === "tool" && m.tool_name === "getMemories")
  )
    options.onRecallContext?.();
  const discordContext = options.recallChannelMemory
    ? "This is a shared Discord channel. Use a quoted reply target to understand the latest message. Use memories from Discord or the web app only when they directly help answer it."
    : "This is a Discord DM with conversation history. Shared memory is unavailable.";
  const discordCapabilities = options.discordTools
    ? "Use the available tools for current date, time, weather, and forecasts. Get fresh data for each request. The clock reports the host's timezone. Ask for a location if it is needed for weather and missing from the conversation. Reminders and manual memory tools are unavailable."
    : "Tools are unavailable.";
  const instructions = options.chatOnly
    ? [NOVA_CONVERSATION_PROMPT, discordContext, discordCapabilities]
    : [NOVA_SYSTEM_PROMPT];
  const systemPrompt = [...instructions, memory].filter(Boolean).join("\n\n");
  const authorizedMemoryWrite = options.authorizedMemoryWrite === undefined
    ? requestedTurnMemoryWrite(messages)
    : options.authorizedMemoryWrite;
  return requestModel(
    {
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
      tools: options.chatOnly
        ? options.discordTools
          ? toolDefinitions.filter(({ function: { name } }) => discordToolNames.has(name))
          : undefined
        : toolDefinitions.filter(
            ({ function: { name } }) =>
              !memoryWriteTools.has(name) || name === authorizedMemoryWrite
          ),
      stream: Boolean(options.onContent) || MODEL_CONFIG.stream,
      think: MODEL_CONFIG.think,
      options: { temperature: MODEL_CONFIG.temperature }
    },
    "Ollama request failed",
    options
  );
}

export async function generateConversationTitle(
  message: string
): Promise<string> {
  const response = await requestModel(
    {
      messages: [
        {
          role: "system",
          content:
            "Generate a short title for a conversation based on the user's message. " +
            "Return only the title. Keep it between 2 and 6 words. " +
            "Do not use quotation marks."
        },
        { role: "user", content: message }
      ],
      stream: false,
      think: false,
      options: { temperature: 0.3 }
    },
    "Ollama title request failed",
    { signal: AbortSignal.timeout(30_000) }
  );
  return response.content.trim();
}
