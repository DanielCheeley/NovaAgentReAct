import { MODEL_CONFIG } from "./novaConfig";
import { NOVA_SYSTEM_PROMPT } from "./novaPrompt";
import { Message } from "../types/conversationType";
import { toolDefinitions } from "./tools/toolDefinitions";
import { ModelResponse } from "../types/modelResponseType";
import type { GenerationOptions } from "../types/generationType";
import { requestOllama } from "./providers/ollama";

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
  options: GenerationOptions = {}
): Promise<ModelResponse> {
  return requestModel(
    {
      messages: [{ role: "system", content: NOVA_SYSTEM_PROMPT }, ...messages],
      tools: toolDefinitions,
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
