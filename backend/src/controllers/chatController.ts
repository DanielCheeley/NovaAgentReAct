import { Request, Response, NextFunction } from "express";
import { handleMessage } from "../novaCore/agent";

export async function chatController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { conversationId, message } = req.body;

    const agentResponse = await handleMessage(
      conversationId,
      message
    )

    res.status(200).json({
      conversationId,
      message: agentResponse,
      title: agentResponse.title
    });
  } catch (error) {
    next(error);
  }
}