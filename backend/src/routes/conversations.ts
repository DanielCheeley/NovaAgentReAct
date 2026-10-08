import { Router } from "express";
import { getConversations } from "../novaCore/memory/conversationStore";

export const conversationsRouter = Router();

conversationsRouter.get("/", (_req, res) => {
  const conversations = getConversations();
  res.json(conversations);
});