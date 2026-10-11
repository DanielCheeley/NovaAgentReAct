import { useEffect, useReducer, useRef } from "react";
import * as api from "../communication/api";
import {
  connectWebSocket,
  disconnectWebSocket,
  setWebSocketMessageHandler
} from "../communication/websocket";
import { chatReducer, initialChatState } from "../state/chatState";

export function useChat() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const requests = useRef(
    new Map<number, { requestId: string; controller: AbortController }>()
  );

  useEffect(
    () => () => {
      for (const request of requests.current.values())
        request.controller.abort();
      requests.current.clear();
    },
    []
  );

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
    stopResponse(id);
    try {
      await api.deleteConversation(id);
      dispatch({ type: "deleted", id });
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  }

  async function sendMessage(id: number, message: string) {
    if (requests.current.has(id)) return;
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    requests.current.set(id, { requestId, controller });
    dispatch({
      type: "message",
      id,
      message: { role: "user", content: message },
      moveToTop: true
    });
    dispatch({ type: "stream.start", id, requestId });
    try {
      await api.streamChatMessage(
        id,
        message,
        requestId,
        controller.signal,
        (event) => {
          if (
            controller.signal.aborted ||
            requests.current.get(id)?.requestId !== requestId
          )
            return;
          if (event.type === "content") {
            dispatch({
              type: "stream.content",
              id,
              requestId,
              content: event.content
            });
          } else if (event.type === "loop.complete") {
            dispatch({
              type: "stream.loop.complete",
              id,
              requestId,
              content: event.content
            });
          } else if (event.type === "done") {
            dispatch({
              type: "stream.done",
              id,
              requestId,
              content: event.message,
              title: event.title,
              timing: event.timing
            });
          }
        }
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Failed to contact Nova backend:", error);
      dispatch({ type: "stream.error", id, requestId });
    } finally {
      if (requests.current.get(id)?.requestId === requestId)
        requests.current.delete(id);
    }
  }

  function stopResponse(id: number) {
    const request = requests.current.get(id);
    if (!request) return;
    request.controller.abort();
    requests.current.delete(id);
    dispatch({ type: "stream.stop", id, requestId: request.requestId });
  }

  return {
    ...state,
    activeConversation: state.conversations.find(
      (conversation) => conversation.id === state.activeConversationId
    ),
    selectConversation: (id: number) => dispatch({ type: "selected", id }),
    createNewConversation,
    deleteConversation,
    sendMessage,
    stopResponse
  };
}
