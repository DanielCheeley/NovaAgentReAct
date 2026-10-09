import { MODEL_CONFIG } from "./novaConfig";
import { NOVA_SYSTEM_PROMPT } from "./novaPrompt";
import { Message } from "../types/conversationType";
import { toolDefinitions } from "./tools/toolRegistry";
import { ModelResponse } from "../types/modelResponseType";

export async function generateResponse(
  messages: Message[]
): Promise<ModelResponse> {
  const response = await fetch(MODEL_CONFIG.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      //gets the used model
      model: MODEL_CONFIG.model,

      //gets the system prompt and all previous messages
      messages: [
        {
          role: "system",
          content: NOVA_SYSTEM_PROMPT
        },
        ...messages
      ],

      //gets all of the defined tools and how to use them
      tools: toolDefinitions,

      //gets the modelconfig settings
      stream: MODEL_CONFIG.stream,
      think: MODEL_CONFIG.think,

      options: {
        temperature: MODEL_CONFIG.temperature
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status}`);
  }

  const data = (await response.json()) as { message: ModelResponse };

  return data.message;
}

export async function generateConversationTitle(
  message: string
): Promise<string> {
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
          content:
            "Generate a short title for a conversation based on the user's message. " +
            "Return only the title. Keep it between 2 and 6 words. " +
            "Do not use quotation marks."
        },
        {
          role: "user",
          content: message
        }
      ],

      stream: false,
      think: false,

      options: {
        temperature: 0.3
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama title request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    message: {
      content: string;
    };
  };

  return data.message.content.trim();
}
