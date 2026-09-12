import { Request, Response, NextFunction } from "express";

export function chatController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { conversationId, message } = req.body;

    res.status(200).json({
      conversationId,
      message: "hello from Nova's backend!"
    });
  } catch (error) {
    next(error);
  }
}