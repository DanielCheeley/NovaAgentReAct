import express from "express";
import cors from 'cors'
import debug from "debug";
import { logRequest } from "./middleware/logger";
import { healthRouter } from "./routes/health";
import { chatRouter } from "./routes/chat";
import { errorHandler } from "./middleware/errorHandler";
import "./novaCore/events/novaEventHandler"

//create a logger instance for the server
const logger = debug('NovaAgent:server');

const app = express();
app.use(cors());
const PORT = 3000;

app.use(logRequest);
app.use(express.urlencoded({ extended: true })); //allows express to pars URL-encoded form data
app.use(express.json());// allows express to parse JSON reqest bodies

//set up routes
app.use('/health', healthRouter);
app.use('/chat', chatRouter);

//error handler must be after routes
app.use(errorHandler)

app.listen(PORT, () => {
  logger(`Nova backend running on http://localhost:${PORT}`);
})