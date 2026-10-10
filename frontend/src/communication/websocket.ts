import { BACKEND_URL } from "./api";

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shouldReconnect = false;

type NovaWebSocketMessage = {
  type: string;
  conversationId?: number;
  message: string;
};

let messageHandler: ((message: NovaWebSocketMessage) => void) | null = null;

export function setWebSocketMessageHandler(
  handler: ((message: NovaWebSocketMessage) => void) | null
) {
  messageHandler = handler;
}

export function connectWebSocket() {
  shouldReconnect = true;

  if (socket) {
    return;
  }

  connect();
}

function connect() {
  if (!shouldReconnect || socket) {
    return;
  }

  const newSocket = new WebSocket(BACKEND_URL.replace(/^http/, "ws"));

  socket = newSocket;

  newSocket.onopen = () => {
    if (socket !== newSocket) return;
    console.log("Connected to Nova WebSocket");
  };

  newSocket.onmessage = (event) => {
    if (socket !== newSocket) return;
    const data = JSON.parse(event.data);

    console.log("Nova WebSocket message:", data);

    messageHandler?.(data);
  };

  newSocket.onerror = (error) => {
    if (socket !== newSocket) return;
    console.error("WebSocket error:", error);
  };

  newSocket.onclose = () => {
    if (socket !== newSocket) {
      return;
    }

    console.log("Nova WebSocket disconnected");

    socket = null;

    if (shouldReconnect && !reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 1000);
    }
  };
}

export function disconnectWebSocket() {
  shouldReconnect = false;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (socket) {
    const currentSocket = socket;

    socket = null;

    currentSocket.close();
  }
}
