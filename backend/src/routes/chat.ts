import { Router } from "express";
import {
  chatController,
  streamChatController
} from "../controllers/chatController";
import { timingSummary } from "../novaCore/metrics";

export const chatRouter = Router();

chatRouter.post("/", chatController);
chatRouter.post("/stream", streamChatController);
chatRouter.get("/metrics", (_req, res) => res.json(timingSummary()));
