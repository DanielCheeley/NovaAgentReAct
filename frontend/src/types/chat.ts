import type { RequestTiming } from "../../../backend/src/types/generationType";

export type Message = {
  role: "user" | "assistant";
  content: string;
  requestId?: string;
  status?: "streaming" | "stopped" | "error";
  timing?: RequestTiming;
};

export type Conversation = {
  id: number;
  title: string;
  messages: Message[];
};
