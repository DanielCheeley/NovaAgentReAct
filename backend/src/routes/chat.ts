import { Router } from "express";

export const chatRouter = Router();

chatRouter.get("/", (req, res) => {
  res.json(
    {
      message: "Chat router is up and running!"
    }
  );
});

chatRouter.post("/", (req, res) => {
  const { conversationId, message } = req.body;

  res.json({
    conversationId,
    message: "hello from Nova's backend!"
  });
});