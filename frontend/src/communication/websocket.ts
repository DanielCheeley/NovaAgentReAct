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
  handler: (message: NovaWebSocketMessage) => void
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

  const newSocket = new WebSocket("ws://localhost:3000");

  socket = newSocket;

  newSocket.onopen = () => {
    console.log("Connected to Nova WebSocket");
  };

  newSocket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    console.log("Nova WebSocket message:", data);

    messageHandler?.(data);
  };

  newSocket.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  newSocket.onclose = () => {
    console.log("Nova WebSocket disconnected");

    if (socket !== newSocket) {
      return;
    }

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