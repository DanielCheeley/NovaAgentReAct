import { getWeather } from "./getWeather";
import { getDateAndTime } from "./getDateAndTime";
import { getForecast } from "./getForecast";
import { scheduleTask } from "./scheduleTask";
import { getTasks } from "./getTasks";
import { cancelTask } from "./cancelTask";
import { rescheduleTask } from "./rescheduleTask";

type ToolContext = {
  conversationId?: number;
};

type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<unknown>;

export type ToolDefinition = {
  execute: ToolHandler;
  requires?: string[];
};

export const tools: Record<string, ToolDefinition> = {
  getWeather: {
    execute: async (args) => {
      return getWeather({
        location: args.location as string,
        state: args.state as string | undefined,
        country: args.country as string | undefined
      });
    }
  },

  getForecast: {
    execute: async (args) => {
      return getForecast({
        location: args.location as string,
        state: args.state as string | undefined,
        country: args.country as string | undefined
      });
    }
  },

  getDateAndTime: {
    execute: async () => {
      return getDateAndTime();
    }
  },

  scheduleTask: {
    requires: ["getDateAndTime"],

    execute: async (args, context) => {
      return scheduleTask({
        conversationId: context.conversationId!,
        task: args.task as string,
        date: args.date as string,
        time: args.time as string,
        timezone: args.timezone as string
      });
    }
  },

  getTasks: {
    execute: async (_args, context) => {
      return getTasks({
        conversationId: context.conversationId!
      });
    }
  },

  cancelTask: {
    requires: ["getTasks"],

    execute: async (args, context) => {
      return cancelTask({
        taskId: args.taskId as string,
        conversationId: context.conversationId!
      });
    }
  },

  rescheduleTask: {
    requires: ["getTasks", "getDateAndTime"],

    execute: async (args, context) => {
      return rescheduleTask({
        taskId: args.taskId as string,
        conversationId: context.conversationId!,
        date: args.date as string,
        time: args.time as string,
        timezone: args.timezone as string
      });
    }
  }
};

export const toolDefinitions = [
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
            description:
              "The state, province, or region of the location, if known"
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
      description:
        "Gets the current date and the time. MUST be used before scheduling a task when the user gives a relative or incomplete time such as 'in 10 minutes', 'at 9 PM', 'tomorrow', or 'Friday'. Use the result to determine the exact date and time for the scheduled task. Never guess the current date or time.",
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
        "Schedules an instruction for Nova to execute at a specific future date and time. Use this when the user asks Nova to remind them of something OR asks Nova to perform/check/review something at a future time. This can include actions Nova should perform on its own, such as checking memory, reviewing information, running a tool, or evaluating something later. Before using this tool, Nova MUST know the exact date, time, and timezone. If the user gives a relative or incomplete time, use getDateAndTime first. Never invent the date, time, or timezone. The scheduling system handles timezone conversion.",
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "What Nova should do or say when the task becomes due."
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
  },

  {
    type: "function",
    function: {
      name: "getTasks",
      description:
        "Gets the pending scheduled tasks for the current conversation. Use this when the user asks what reminders or scheduled tasks they have, or when you need to identify an existing task before cancelling or modifying it.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },

  {
    type: "function",
    function: {
      name: "cancelTask",
      description:
        "Cancels a pending scheduled task in the current conversation. Use getTasks first when the user identifies a task by description rather than task ID. Never invent a task ID.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description:
              "The ID of the pending task to cancel. Only use a task ID returned by getTasks."
          }
        },
        required: ["taskId"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "rescheduleTask",
      description:
        "Changes the scheduled time of an existing pending task. Use getTasks first when the user identifies a task by description rather than task ID. The task must already exist and be pending. If the user gives a relative or incomplete time such as 'in 20 minutes', use getDateAndTime first to determine the current local date, time, and timezone. Never invent the date, time, or timezone. Do not create a new task when rescheduling an existing one.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description:
              "The ID of the existing pending task to reschedule. Only use a task ID returned by getTasks or otherwise verified during the current request."
          },
          date: {
            type: "string",
            description: "The new local calendar date, formatted as YYYY-MM-DD."
          },
          time: {
            type: "string",
            description: "The new local time, formatted as HH:mm:ss."
          },
          timezone: {
            type: "string",
            description:
              "The IANA timezone for the new scheduled time, such as America/Chicago."
          }
        },
        required: ["taskId", "date", "time", "timezone"]
      }
    }
  }
];
