export type Message = {
  sender: "user" | "nova";
  text: string;
};

export type Conversation = {
  id: number;
  title: string;
  messages: Message[];
};