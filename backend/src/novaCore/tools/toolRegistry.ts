import { completeTask } from "./completeTask";
import { getWeather } from "./getWeather";
import { getDateAndTime } from "./getDateAndTime";
import { getForecast } from "./getForecast";
import { scheduleTask } from "./scheduleTask";

type ToolContext = {
  conversationId?: number;
}
type ToolHandler = (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>;

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
  scheduleTask: async (args, context) => {
    return scheduleTask({
      conversationId: context.conversationId!,
      task: args.task as string,
      date: args.date as string,
      time: args.time as string,
      timezone: args.timezone as string
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
      description:
        "Gets the current weather for a specific location. If the tool returns an ambiguous result, ask the user which location they mean. If it returns not_found, tell the user the location could not be found and ask them to clarify. Do not repeatedly call the tool with the same location when it returns ambiguous or not_found.",
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
      description:
        "Gets the weather forecast for a specific location. If the tool returns an ambiguous result, ask the user which location they mean. If it returns not_found, tell the user the location could not be found and ask them to clarify. Do not repeatedly call the tool with the same location when it returns ambiguous or not_found.",
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
        "Schedules a task for Nova to handle at a specific future date and time. Use this when the user explicitly asks Nova to remind them, tell them something later, ask them something later, or perform an action at a future time. Do NOT use this for normal questions, explanations, lists, code, or other immediate requests. Before calling this tool, Nova MUST know the exact date, time, and timezone. If the user gives an incomplete or relative time, use getDateAndTime first. Never invent a date or time. Provide the date and time in the user's local timezone. Do not convert the time to UTC. The scheduling system handles timezone conversion. Do not merely tell the user that something is scheduled. The task is not scheduled until this tool is successfully called.",
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description:
              "What Nova should do or say when the task becomes due."
          },
          date: {
            type: "string",
            description:
              "The exact local calendar date when the task should become due, formatted as YYYY-MM-DD."
          },
          time: {
            type: "string",
            description:
              "The exact local time when the task should become due, formatted as HH:mm:ss."
          },
          timezone: {
            type: "string",
            description:
              "The IANA timezone for the scheduled time, such as America/Chicago."
          }
        },
        required: ["task", "date", "time", "timezone"]
      }
    }
  }
];