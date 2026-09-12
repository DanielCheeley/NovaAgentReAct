import Stream from "stream";
import { MODEL_CONFIG } from "./novaConfig";
import { NOVA_SYSTEM_PROMPT } from "./novaPrompt";
import { Message } from "../types/message";


export async function generateResponse(messages: Message[]): Promise<string> {
  const response = await fetch(MODEL_CONFIG.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL_CONFIG.model,
      messages: [
        {
          role: "system",
          content: NOVA_SYSTEM_PROMPT
        },
        ...messages
      ],
      stream: MODEL_CONFIG.stream,
      think: MODEL_CONFIG.think
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status}`);
  }

  const data = await response.json();

  return data.message.content;
}