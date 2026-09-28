import { handleEvent } from "../agent";
import { on } from "./eventBus"
import debug from "debug"
import { sendToClients } from "../../communication/websocket";

const logger = debug("NovaAgent:eventHandler");

on("task.due", async (event) => {
  logger("Nova received a scheduled task!");

  const response = await handleEvent(event);

  const task = event.data as {
    conversationId: number;
  };

  sendToClients({
    type: "nova.message",
    conversationId: task.conversationId,
    message: response.response
  });
});