import { Router } from "express";
import {
  deleteConversation,
  getConversations
} from "../novaCore/memory/conversationStore";
import { inConversation } from "../novaCore/conversationQueue";

export const conversationsRouter = Router();

conversationsRouter.get("/", (_req, res) => {
  const conversations = getConversations();
  res.json(conversations);
});

conversationsRouter.delete("/:id", async (req, res) => {
  const conversationId = Number(req.params.id);

  if (!Number.isInteger(conversationId)) {
    res.status(400).json({
      error: "Invalid conversation ID"
    });
    return;
  }

  await inConversation(conversationId, async () =>
    deleteConversation(conversationId)
  );

  res.status(204).send();
});
