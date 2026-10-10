import { MODEL_CONFIG } from "./novaConfig";
import { NOVA_SYSTEM_PROMPT } from "./novaPrompt";
import { Message } from "../types/conversationType";
import { toolDefinitions } from "./tools/toolDefinitions";
import { ModelResponse } from "../types/modelResponseType";

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
  signal?: AbortSignal
): Promise<ModelResponse> {
  const response = await fetch(MODEL_CONFIG.url, {
    signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL_CONFIG.model, ...request })
  });
  if (!response.ok) throw new Error(`${errorLabel}: ${response.status}`);
  const data = (await response.json()) as { message: ModelResponse };
  return data.message;
}

export function generateResponse(messages: Message[]): Promise<ModelResponse> {
  return requestModel(
    {
      messages: [{ role: "system", content: NOVA_SYSTEM_PROMPT }, ...messages],
      tools: toolDefinitions,
      stream: MODEL_CONFIG.stream,
      think: MODEL_CONFIG.think,
      options: { temperature: MODEL_CONFIG.temperature }
    },
    "Ollama request failed"
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
    AbortSignal.timeout(30_000)
  );
  return response.content.trim();
}
