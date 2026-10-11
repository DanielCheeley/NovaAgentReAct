import type { RequestTiming } from "./generationType";

export type ChatStreamEvent =
  | { type: "start"; requestId: string; conversationId: number }
  | { type: "content"; requestId: string; content: string }
  | { type: "loop.complete"; requestId: string; content: string }
  | {
      type: "done";
      requestId: string;
      message: string;
      title: string;
      timing: RequestTiming;
    }
  | { type: "error"; requestId: string; message: string };
