export type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type Conversation = {
  id: number;
  messages: Message[];
};