import { handleEvent } from "../agent";
import { on } from "./eventBus";
import debug from "debug";
import { sendToClients } from "../../communication/websocket";
import { completeTask } from "../tasks/taskStore";

const logger = debug("NovaAgent:eventHandler");

on("task.due", async (event) => {
  logger("Nova received a scheduled task!");

  const task = event.data as {
    id: string;
    conversationId: number;
  };

  // Mark the task as completed because the scheduler has fired it.
  completeTask(task.id);

  const response = await handleEvent(event);

  sendToClients({
    type: "nova.message",
    conversationId: task.conversationId,
    message: response.response
  });
});
