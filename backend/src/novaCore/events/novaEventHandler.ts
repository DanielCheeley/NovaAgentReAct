import { handleEvent } from "../agent";
import { on } from "./eventBus"
import debug from "debug"

const logger = debug("NovaAgent:eventHandler:");

on("task.due", (event) => {
  logger("Nova received a scheduled task!");
  handleEvent(event);
});