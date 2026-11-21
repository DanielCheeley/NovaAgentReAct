import { requestedMemoryWrite } from "./memory/memoryIntent";
import { MODEL_CONFIG } from "./novaConfig";
import { NOVA_CONVERSATION_PROMPT, NOVA_SYSTEM_PROMPT } from "./novaPrompt";
import { Message } from "../types/conversationType";
import { toolDefinitions } from "./tools/toolDefinitions";
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
    recallChannelMemory?: boolean;
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
    ? "This is a shared Discord channel. Use a quoted reply target to understand the latest message. Use memories from Discord or the web app only when they directly help answer it. Manual memory tools and reminders are unavailable."
    : "This is a Discord chat with conversation history. Long-term memory, reminders, and tools are unavailable.";
  const systemPrompt = options.chatOnly
    ? [NOVA_CONVERSATION_PROMPT, discordContext, memory].filter(Boolean).join("\n\n")
    : NOVA_SYSTEM_PROMPT;
  return requestModel(
    {
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
        ...(!options.chatOnly && memory
          ? [{ role: "system" as const, content: memory }]
          : [])
      ],
      tools: options.chatOnly ? undefined : toolDefinitions.filter(
        ({ function: { name } }) =>
          !["rememberMemory", "updateMemory", "forgetMemory"].includes(name) ||
          name ===
            requestedMemoryWrite(messages.findLast((m) => m.role === "user"))
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
