import { ToolCall } from "./modelResponseType";

export type Message = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  tool_name?: string;
};

export type Conversation = {
  id: number;
  messages: Message[];
};