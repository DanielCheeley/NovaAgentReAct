import type { Conversation, Message } from "../types/chat";

export type ChatState = {
  conversations: Conversation[];
  activeConversationId: number | null;
  generatingConversationIds: Set<number>;
};

export const initialChatState: ChatState = {
  conversations: [],
  activeConversationId: null,
  generatingConversationIds: new Set()
};

export type ChatAction =
  | { type: "loaded"; conversations: Conversation[] }
  | { type: "created"; conversation: Conversation }
  | { type: "selected"; id: number }
  | { type: "deleted"; id: number }
  | { type: "title"; id: number; title: string }
  | {
      type: "message";
      id: number;
      message: Message;
      title?: string;
      moveToTop?: boolean;
    }
  | { type: "generating"; id: number; value: boolean };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "loaded":
      return {
        ...state,
        conversations: action.conversations,
        activeConversationId: action.conversations[0]?.id ?? null
      };
    case "created":
      return {
        ...state,
        conversations: [action.conversation, ...state.conversations],
        activeConversationId: action.conversation.id
      };
    case "selected":
      return { ...state, activeConversationId: action.id };
    case "title":
      return {
        ...state,
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.id
            ? { ...conversation, title: action.title }
            : conversation
        )
      };
    case "deleted": {
      const conversations = state.conversations.filter(
        (conversation) => conversation.id !== action.id
      );
      return {
        ...state,
        conversations,
        activeConversationId:
          state.activeConversationId === action.id
            ? (conversations[0]?.id ?? null)
            : state.activeConversationId
      };
    }
    case "message": {
      const existing = state.conversations.find(
        (conversation) => conversation.id === action.id
      );
      if (!existing) return state;
      const updated = {
        ...existing,
        // A title event can arrive before an older HTTP response is handled.
        title: action.title && action.title !== "New Conversation"
          ? action.title
          : existing.title,
        messages: [...existing.messages, action.message]
      };
      return {
        ...state,
        conversations: action.moveToTop
          ? [
              updated,
              ...state.conversations.filter(
                (conversation) => conversation.id !== action.id
              )
            ]
          : state.conversations.map((conversation) =>
              conversation.id === action.id ? updated : conversation
            )
      };
    }
    case "generating": {
      const ids = new Set(state.generatingConversationIds);
      if (action.value) ids.add(action.id);
      else ids.delete(action.id);
      return { ...state, generatingConversationIds: ids };
    }
  }
}
