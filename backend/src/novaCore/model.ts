import { requestedMemoryWrite } from "./memory/memoryIntent";
import { MODEL_CONFIG } from "./novaConfig";
import { NOVA_SYSTEM_PROMPT } from "./novaPrompt";
import { Message } from "../types/conversationType";
import { toolDefinitions } from "./tools/toolDefinitions";
import { ModelResponse } from "../types/modelResponseType";
import type { GenerationOptions } from "../types/generationType";
import { requestOllama } from "./providers/ollama";
import { memoryContext } from "./memory/longTermMemoryStore";

import { episodeContext } from "./memory/episodeStore";
import { preferenceContext } from "./memory/learnPreference";

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
  options: GenerationOptions & { onRecallContext?: () => void } = {}
): Promise<ModelResponse> {
  const query = messages.findLast((m) => m.role === "user")?.content ?? "";
  const recalled = [preferenceContext(query), episodeContext(query)].filter(
    Boolean
  );
  if (
    recalled.length ||
    messages.some((m) => m.role === "tool" && m.tool_name === "getMemories")
  )
    options.onRecallContext?.();
  const savedFacts = [memoryContext(), ...recalled].filter(Boolean).join("\n");
  return requestModel(
    {
      messages: [
        { role: "system", content: NOVA_SYSTEM_PROMPT },
        ...messages,
        ...(savedFacts
          ? [{ role: "system" as const, content: savedFacts }]
          : [])
      ],
      tools: toolDefinitions.filter(
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
