import { Request, Response, NextFunction } from "express";
import { handleMessage } from "../novaCore/agent";
import { conversationTitles } from "../novaCore/background/conversationTitles";

export async function chatController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { conversationId, message } = req.body;

    const agentResponse = await handleMessage(conversationId, message);

    if (agentResponse.title === "New Conversation") {
      res.once("finish", () => {
        void conversationTitles.enqueue(conversationId);
      });
    }

    res.status(200).json({
      conversationId,
      message: agentResponse.response,
      title: agentResponse.title
    });
  } catch (error) {
    next(error);
  }
}
