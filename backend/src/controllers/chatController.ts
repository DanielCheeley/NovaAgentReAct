import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { handleMessage } from "../novaCore/agent";
import { conversationTitles } from "../novaCore/background/conversationTitles";
import { recordTiming } from "../novaCore/metrics";
import type { RequestTiming } from "../types/generationType";
import type { ChatStreamEvent } from "../types/chatStreamType";
import type { AgentOptions } from "../novaCore/agentLoop";

export function createChatController(streaming: boolean) {
  return async function chat(req: Request, res: Response, next: NextFunction) {
    const { conversationId, message, requestId: suppliedId } = req.body ?? {};
    if (
      !Number.isSafeInteger(conversationId) ||
      conversationId < 1 ||
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 50_000 ||
      (suppliedId !== undefined &&
        (typeof suppliedId !== "string" || !/^[\w-]{1,80}$/.test(suppliedId)))
    ) {
      res.status(400).json({ error: "Invalid chat request" });
      return;
    }
    const requestId: string = suppliedId ?? randomUUID();
    const started = performance.now();
    const abort = new AbortController();
    const timing: RequestTiming = {
      requestId,
      conversationId,
      elapsedMs: 0,
      firstContentMs: null,
      status: "error",
      models: [],
      tools: []
    };
    const disconnected = () => {
      if (!res.writableFinished) abort.abort();
    };
    res.on("close", disconnected);
    const send = (event: ChatStreamEvent) => {
      if (abort.signal.aborted || res.destroyed || res.writableEnded) return;
      if (res.writableLength > 1_048_576) {
        abort.abort();
        return;
      }
      res.write(JSON.stringify(event) + "\n");
    };
    const options: AgentOptions = {
      signal: abort.signal,
      onModelTiming: (sample) => timing.models.push(sample),
      onToolTiming: (sample) => timing.tools.push(sample),
      ...(streaming
        ? {
            onLoopComplete: (content: string) => {
              send({ type: "loop.complete", requestId, content });
            },
            onContent: (content: string) => {
              if (abort.signal.aborted) return;
              if (content)
                timing.firstContentMs ??= performance.now() - started;
              send({ type: "content", requestId, content });
            }
          }
        : {})
    };
    try {
      if (streaming) {
        res.status(200).set({
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no"
        });
        res.flushHeaders();
        send({ type: "start", requestId, conversationId });
      }
      const result = await handleMessage(conversationId, message, options);
      timing.status = result.cancelled ? "cancelled" : "completed";
      timing.elapsedMs = performance.now() - started;
      if (abort.signal.aborted || result.cancelled) {
        if (!res.destroyed) res.end();
        return;
      }
      if (result.title === "New Conversation") {
        res.once("finish", () => {
          void conversationTitles.enqueue(conversationId);
        });
      }
      if (streaming) {
        send({
          type: "done",
          requestId,
          message: result.response,
          title: result.title,
          timing
        });
        res.end();
      } else {
        res.status(200).json({
          conversationId,
          message: result.response,
          title: result.title,
          requestId,
          timing
        });
      }
    } catch (error) {
      if (abort.signal.aborted) {
        timing.status = "cancelled";
        if (!res.destroyed) res.end();
      } else if (streaming && res.headersSent) {
        send({
          type: "error",
          requestId,
          message: "Nova could not finish this response. Please try again."
        });
        res.end();
        console.error("Nova stream failed", error);
      } else next(error);
    } finally {
      if (abort.signal.aborted) timing.status = "cancelled";
      timing.elapsedMs = performance.now() - started;
      res.off("close", disconnected);
      recordTiming(timing);
    }
  };
}

export const chatController = createChatController(false);
export const streamChatController = createChatController(true);
