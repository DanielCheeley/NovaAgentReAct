import { on } from "./eventBus"
import debug from "debug"

const logger = debug("NovaAgent:eventHandler:");

on("timer.tick", (event) => {
  logger("Nova received timer event:", event);
});