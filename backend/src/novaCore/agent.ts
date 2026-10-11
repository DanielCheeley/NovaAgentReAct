import debug from "debug";
import { getConversation, addMessage } from "./memory/conversationStore";
import { Message } from "../types/conversationType";
import { NovaEvent } from "../types/eventType";
import { runAgent, type AgentOptions } from "./agentLoop";
import { inConversation } from "./conversationQueue";
import { generateResponse } from "./model";

// Preserve the existing entry point for callers.
export { runAgent } from "./agentLoop";

const logger = debug("NovaAgent:Agent");

// Handle a received message.
export async function handleMessage(
  conversationId: number,
  message: string,
  options: AgentOptions = {}
) {
  return inConversation(
    conversationId,
    async () => {
      addMessage(conversationId, {
        role: "user",
        content: message
      });

      logger("Nova received:", { conversationId, message });

      const updatedConversation = getConversation(conversationId);
      const messages = [...updatedConversation.messages];

      let partial = "";
      const result = await runAgent(
        messages,
        conversationId,
        generateResponse,
        {
          ...options,
          onLoopComplete: (content) => {
            partial = "";
            options.onLoopComplete?.(content);
          },
          onContent: options.onContent
            ? (content) => {
                partial = content;
                options.onContent!(content);
              }
            : undefined,
          // Persist tool outcomes immediately, including when Stop arrives mid-action.
          onRecord: (generated) => {
            addMessage(conversationId, generated);
            options.onRecord?.(generated);
          }
        }
      );
      if (result.cancelled) {
        addMessage(conversationId, {
          role: "assistant",
          content:
            (partial ? partial + "\n\n" : "") +
            "[Response stopped by the user. Any tools already executed still apply.]"
        });
      }

      logger("Nova responded:", result);

      return {
        response: result.response,
        title: getConversation(conversationId).title,
        cancelled: result.cancelled ?? false
      };
    },
    options.signal
  );
}

// Handle a received event.
export async function handleEvent(event: NovaEvent) {
  logger("Nova handling event:", event);

  const task = event.data as {
    conversationId?: number;
  };

  if (typeof task.conversationId !== "number") {
    throw new Error("Scheduled event is missing conversationId");
  }

  const id = task.conversationId;
  return inConversation(id, async () => {
    const conversation = getConversation(id);

    const messages: Message[] = [
      ...conversation.messages,
      {
        role: "system",
        content: `A scheduled event has occurred: ${JSON.stringify(event)}. Determine what Nova should do in response.`
      }
    ];

    const response = await runAgent(messages, id, generateResponse, {
      onRecord: (generated) => addMessage(id, generated)
    });

    logger("Nova decided:", response);

    return {
      ...response,
      conversationId: task.conversationId
    };
  });
}
