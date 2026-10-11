import type { Conversation, Message } from "../types/chat";
import type { RequestTiming } from "../../../backend/src/types/generationType";

export type ChatState = {
  conversations: Conversation[];
  activeConversationId: number | null;
  generatingConversationIds: Set<number>;
  activeRequests: Record<number, string>;
};

export const initialChatState: ChatState = {
  conversations: [],
  activeConversationId: null,
  generatingConversationIds: new Set(),
  activeRequests: {}
};

export type ChatAction =
  | { type: "loaded"; conversations: Conversation[] }
  | { type: "created"; conversation: Conversation }
  | { type: "selected"; id: number }
  | { type: "deleted"; id: number }
  | { type: "title"; id: number; title: string }
  | { type: "stream.start"; id: number; requestId: string }
  | { type: "stream.content"; id: number; requestId: string; content: string }
  | {
      type: "stream.loop.complete";
      id: number;
      requestId: string;
      content: string;
    }
  | {
      type: "stream.done";
      id: number;
      requestId: string;
      content: string;
      title: string;
      timing: RequestTiming;
    }
  | { type: "stream.stop" | "stream.error"; id: number; requestId: string }
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
    case "stream.start": {
      if (
        !state.conversations.some(
          (conversation) => conversation.id === action.id
        )
      )
        return state;
      const ids = new Set(state.generatingConversationIds);
      ids.add(action.id);
      return {
        ...state,
        activeRequests: {
          ...state.activeRequests,
          [action.id]: action.requestId
        },
        generatingConversationIds: ids,
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.id
            ? {
                ...conversation,
                messages: [
                  ...conversation.messages,
                  {
                    role: "assistant",
                    content: "",
                    requestId: action.requestId,
                    status: "streaming"
                  }
                ]
              }
            : conversation
        )
      };
    }
    case "stream.loop.complete": {
      if (state.activeRequests[action.id] !== action.requestId) return state;
      return {
        ...state,
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.id
            ? {
                ...conversation,
                messages: [
                  ...conversation.messages.map((message) =>
                    message.requestId === action.requestId
                      ? { role: "assistant" as const, content: action.content }
                      : message
                  ),
                  {
                    role: "assistant",
                    content: "",
                    requestId: action.requestId,
                    status: "streaming"
                  }
                ]
              }
            : conversation
        )
      };
    }
    case "stream.content":
    case "stream.done":
    case "stream.stop":
    case "stream.error": {
      if (state.activeRequests[action.id] !== action.requestId) return state;
      const requests = { ...state.activeRequests };
      const ids = new Set(state.generatingConversationIds);
      if (action.type !== "stream.content") {
        delete requests[action.id];
        ids.delete(action.id);
      }
      return {
        ...state,
        activeRequests: requests,
        generatingConversationIds: ids,
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.id
            ? {
                ...conversation,
                title:
                  action.type === "stream.done" &&
                  action.title !== "New Conversation"
                    ? action.title
                    : conversation.title,
                messages: conversation.messages.map((message) =>
                  message.requestId === action.requestId
                    ? {
                        ...message,
                        content:
                          action.type === "stream.content" ||
                          action.type === "stream.done"
                            ? action.content
                            : message.content,
                        status:
                          action.type === "stream.content"
                            ? "streaming"
                            : action.type === "stream.done"
                              ? undefined
                              : action.type === "stream.stop"
                                ? "stopped"
                                : "error",
                        ...(action.type === "stream.done"
                          ? { timing: action.timing }
                          : {})
                      }
                    : message
                )
              }
            : conversation
        )
      };
    }
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
      const activeRequests = { ...state.activeRequests };
      delete activeRequests[action.id];
      const ids = new Set(state.generatingConversationIds);
      ids.delete(action.id);
      const conversations = state.conversations.filter(
        (conversation) => conversation.id !== action.id
      );
      return {
        ...state,
        activeRequests,
        generatingConversationIds: ids,
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
        title:
          action.title && action.title !== "New Conversation"
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
