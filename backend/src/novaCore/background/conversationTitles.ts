import debug from "debug";
import { createTitleQueue } from "./titleQueue";
import { generateConversationTitle } from "../model";
import {
  getConversationTitleSeed,
  updateUntitledConversation
} from "../memory/conversationStore";
import { sendToClients } from "../../communication/websocket";

const logger = debug("NovaAgent:Titles");

export const conversationTitles = createTitleQueue({
  getSeed: getConversationTitleSeed,
  generate: generateConversationTitle,
  save: updateUntitledConversation,
  notify: (conversationId, title) => {
    sendToClients({ type: "conversation.title", conversationId, title });
  },
  onError: (error) => logger("Background title generation failed:", error)
});
