import { Request, Response, NextFunction } from "express";
import { novaAgent } from "../novaCore/agent";

export async function chatController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { conversationId, message } = req.body;

    const agentResponse = await novaAgent(
      conversationId,
      message
    )

    res.status(200).json({
      conversationId,
      message: agentResponse
    });
  } catch (error) {
    next(error);
  }
}