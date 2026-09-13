import { completeTask } from "./completeTask";
import { getWeather } from "./getWeather";
import { getDateAndTime } from "./getDateAndTime";

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export const tools: Record<string, ToolHandler> = {
completeTask: async (args) => {
    return completeTask({task: args.task as string});
  },

  getWeather: async (args) => {
    return getWeather({location: args.location as string});
  },

  getDateAndTime: async () => {
    return getDateAndTime();
  }
};

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "completeTask",
      description: "Completes a scheduled task.",
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "The task to complete"
          }
        },
        required: ["task"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "getWeather",
      description: "Gets weather from a specific location.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The location to get weather for"
          }
        },
        required: ["location"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "getDateAndTime",
      description: "Gets the current date and the time.",
      parameters: {
        type: "object"
      }
    }
  }
];