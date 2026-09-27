import { completeTask } from "./completeTask";
import { getWeather } from "./getWeather";
import { getDateAndTime } from "./getDateAndTime";
import { getForecast } from "./getForecast";
import { scheduleTask } from "./scheduleTask";

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export const tools: Record<string, ToolHandler> = {
completeTask: async (args) => {
    return completeTask({task: args.task as string});
  },

  getWeather: async (args) => {
    return getWeather({location: args.location as string, state: args.state as string | undefined, country: args.country as string | undefined});
  },

  getForecast: async (args) => {
    return getForecast({
        location: args.location as string,
        state: args.state as string | undefined,
        country: args.country as string | undefined
      });
    },

  getDateAndTime: async () => {
    return getDateAndTime();
  },
  scheduleTask: async (args) => {
    return scheduleTask({
      task: args.task as string,
      runAt: args.runAt as string
    });
  },
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
            description: "The city or location to get weather for"
          },
          state: {
            type: "string",
            description: "The state, province, or region of the location, if known"
          },
          country: {
            type: "string",
            description: "The country of the location, if known"
          }
        },
        required: ["location"]
      }
    }
  },

  {
  type: "function",
    function: {
      name: "getForecast",
      description: "Gets the weather forecast for a location.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city or location"
          },
          state: {
            type: "string",
            description: "The state, province, or region, if known"
          },
          country: {
            type: "string",
            description: "The country, if known"
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
      description: "Gets the current date and the time. MUST be used before scheduling a task when the user gives a relative or incomplete time such as 'in 10 minutes', 'at 9 PM', 'tomorrow', or 'Friday'. Use the result to determine the exact date and time for the scheduled task. Never guess the current date or time.",
      parameters: {
        type: "object"
      }
    }
  },

  {
    type: "function",
    function: {
      name: "scheduleTask",
      description:
        "Schedules a task for Nova to handle at a specific future date and time. Use this when the user explicitly asksNova  to remind them, tell them something later, ask them something later, or perform an action at a future time.Do NOT use   this for normal questions, explanations, lists, code, or other immediate requests. Schedules a task for a specific future date and time. Before calling this tool, Nova MUST know the exact date, time, and timezone. If the user gives an incomplete or relative time, use getDateAndTime first. Never invent a date or time. Do not merely tell the user that something is scheduled. The task is not scheduled until this tool is successfully called.",
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description:
            "What Nova should do or say when the task becomes due."
          },
          runAt: {
            type: "string",
            description:
              "The exact future date and time when the task should become due, formatted as an ISO 8601 timestamp."
          }
        },
        required: ["task", "runAt"]
      }
    }
  }
];