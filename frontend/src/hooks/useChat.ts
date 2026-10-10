import { useEffect, useReducer } from "react";
import * as api from "../communication/api";
import {
  connectWebSocket,
  disconnectWebSocket,
  setWebSocketMessageHandler
} from "../communication/websocket";
import { chatReducer, initialChatState } from "../state/chatState";

export function useChat() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  useEffect(() => {
    setWebSocketMessageHandler((data) => {
      if (
        data.type === "nova.message" &&
        typeof data.conversationId === "number" &&
        typeof data.message === "string"
      ) {
        dispatch({
          type: "message",
          id: data.conversationId,
          message: { role: "assistant", content: data.message }
        });
      }
      if (
        data.type === "conversation.title" &&
        typeof data.conversationId === "number" &&
        typeof data.title === "string"
      ) {
        dispatch({ type: "title", id: data.conversationId, title: data.title });
      }
    });
    connectWebSocket();
    return () => {
      setWebSocketMessageHandler(null);
      disconnectWebSocket();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void api
      .loadConversations(controller.signal)
      .then((conversations) => {
        if (!controller.signal.aborted)
          dispatch({ type: "loaded", conversations });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          console.error("Failed to load conversations:", error);
      });
    return () => controller.abort();
  }, []);

  function createNewConversation() {
    dispatch({
      type: "created",
      conversation: { id: Date.now(), title: "New Conversation", messages: [] }
    });
  }

  async function deleteConversation(id: number) {
    try {
      await api.deleteConversation(id);
      dispatch({ type: "deleted", id });
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  }

  async function sendMessage(id: number, message: string) {
    dispatch({ type: "generating", id, value: true });
    dispatch({
      type: "message",
      id,
      message: { role: "user", content: message },
      moveToTop: true
    });
    try {
      const response = await api.sendChatMessage(id, message);
      dispatch({
        type: "message",
        id,
        title: response.title,
        message: { role: "assistant", content: response.message },
        moveToTop: true
      });
    } catch (error) {
      console.error("Failed to contact Nova backend:", error);
      dispatch({
        type: "message",
        id,
        message: {
          role: "assistant",
          content: "Sorry, I'm having trouble connecting to my server."
        },
        moveToTop: true
      });
    } finally {
      dispatch({ type: "generating", id, value: false });
    }
  }

  return {
    ...state,
    activeConversation: state.conversations.find(
      (conversation) => conversation.id === state.activeConversationId
    ),
    selectConversation: (id: number) => dispatch({ type: "selected", id }),
    createNewConversation,
    deleteConversation,
    sendMessage
  };
}
