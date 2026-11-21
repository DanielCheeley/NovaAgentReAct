import { startIdleMemoryReview } from "./novaCore/memory/idleMemoryReview";
import express from "express";
import cors from "cors";
import debug from "debug";
import { createServer } from "node:http";
import { logRequest } from "./middleware/logger";
import { healthRouter } from "./routes/health";
import { chatRouter } from "./routes/chat";
import { conversationsRouter } from "./routes/conversations";
import { errorHandler } from "./middleware/errorHandler";
import "./novaCore/events/novaEventHandler";
import "./database/database";
import { startScheduler } from "./novaCore/tasks/scheduler";
import { startWebSocketServer } from "./communication/websocket";
import { discordChannelId, discordDatabasePath } from "./database/discordDatabase";
import { configureMemorySources } from "./novaCore/memory/memorySources";

//create a logger instance for the server
const logger = debug("NovaAgent:server");

const app = express();
app.use(cors());
const PORT = 3000;

app.use(logRequest);
app.use(express.urlencoded({ extended: true })); //allows express to pars URL-encoded form data
app.use(express.json()); // allows express to parse JSON reqest bodies

//set up routes
app.use("/health", healthRouter);
app.use("/chat", chatRouter);
app.use("/conversations", conversationsRouter);

//error handler must be after routes
app.use(errorHandler);

//create and start the server for websocket connection with client
const server = createServer(app);

//set up services
startWebSocketServer(server);
startScheduler();
configureMemorySources("Web app", discordDatabasePath(discordChannelId()));
startIdleMemoryReview();

server.listen(PORT, () => {
  logger(`Nova backend running on http://localhost:${PORT}`);
});
