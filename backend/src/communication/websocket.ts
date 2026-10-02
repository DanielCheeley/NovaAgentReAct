import { WebSocketServer, WebSocket } from "ws";
import { Server } from "node:http"
import debug from "debug";

const logger = debug("NovaAgent:Websocket")

const clients = new Set<WebSocket>();

export function startWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket) => {
    logger("WebSocket client connected");

    clients.add(socket);

    socket.on("close", () => {
      logger("WebSocket client disconnected");

      clients.delete(socket);
    });

    socket.on("error", (error) => {
      logger("WebSocket error:", error);
      clients.delete(socket);
    });

    socket.send(
      JSON.stringify({
        type: "connection",
        message: "Connected to Nova"
      })
    );
  });

  return wss;
}

export function sendToClients(message: unknown) {
  const data = JSON.stringify(message);

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}