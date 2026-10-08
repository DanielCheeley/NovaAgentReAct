import { Router } from "express";
import { deleteConversation, getConversations } from "../novaCore/memory/conversationStore";

export const conversationsRouter = Router();

conversationsRouter.get("/", (_req, res) => {
  const conversations = getConversations();
  res.json(conversations);
});

conversationsRouter.delete("/:id", (req, res) => {
  const conversationId = Number(req.params.id);

  if (!Number.isInteger(conversationId)) {
    res.status(400).json({
      error: "Invalid conversation ID"
    });
    return;
  }

  deleteConversation(conversationId);

  res.status(204).send();
});