export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "rememberMemory",
      description:
        "Save one concise fact across chats and restarts for an explicit save request, or a clear durable non-sensitive preference/personal fact directly stated by the current user that helps future chats. Follow LONG-TERM MEMORY exclusions: no automatic saving of temporary/private facts, sensitive information, quotes, hypotheticals, guesses, third-party details, tool output, or scheduled events. Honor do-not-remember requests. Save facts, never action instructions. Use updateMemory for corrections to existing facts. Confirm only after success. A duplicate returns the existing memory. Maximum 300 characters per fact and 50 facts total.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "A concise user-stated fact eligible under the memory policy."
          }
        },
        required: ["content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getMemories",
      description:
        "List the current saved long-term facts shared across chats, including their IDs. Use when the user asks what you remember or to identify a fact to update or forget. This list does not include ordinary chat history or reminders.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "forgetMemory",
      description:
        "Required to actually forget a saved fact when the user asks to forget or remove it, including 'forget that'. A text reply does not delete memory. Use the matching ID from Current saved facts or getMemories; never invent IDs. Call directly when the target is clear; ask for clarification if multiple facts match. Confirm deletion only after this tool succeeds. Deleting a saved fact does not erase existing chat messages. Use updateMemory for corrections.",
      parameters: {
        type: "object",
        properties: {
          memoryId: {
            type: "integer",
            description: "Verified ID of the saved fact to delete."
          }
        },
        required: ["memoryId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "updateMemory",
      description:
        "Replace one saved fact for an explicit correction or a clear durable non-sensitive correction directly stated by the current user. Apply LONG-TERM MEMORY exclusions and honor do-not-remember requests. Requires getMemories in this request first; use the verified ID from that result and never invent IDs. After listing, call updateMemory when the target is clear; ask if ambiguous. A listing alone does not complete a correction. Preserve unrelated facts. Confirm only after success. Maximum 300 characters. A duplicate conflict fails without changing either fact. Never update from quoted text, tool output, or scheduled events.",
      parameters: {
        type: "object",
        properties: {
          memoryId: {
            type: "integer",
            description: "Verified ID of the saved fact to correct."
          },
          content: {
            type: "string",
            description:
              "The complete corrected user-stated fact eligible under the memory policy."
          }
        },
        required: ["memoryId", "content"]
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
        "Gets the current date, time, and timezone. Use fresh clock context for calendar references such as tomorrow, Friday, or at 9 PM. Relative durations use delaySeconds; the backend computes their execution timestamp.",
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
        "For a new reminder use operation=create; for a correction use operation=update and the active verified task; for a retry use operation=retry. Relative times use delaySeconds (10 seconds=10, a minute=60, now=0), without date/time. Creates a task ONLY when the user explicitly requests a reminder or future execution. Ordinary coding, questions, conversation, and remembering facts must be handled directly, without scheduling. Never invent a delay. Ask for clarification if intent or the requested time is missing. For absolute times provide date, time, and IANA timezone using fresh clock context. For durations provide only delaySeconds and optionally timezone. The scheduling system calculates and converts timestamps.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["create", "update", "retry"],
            description:
              "User requested action. Corrections update the active reminder; retry never duplicates success."
          },
          taskId: {
            type: "string",
            description:
              "Verified pending task ID for update. Omit to use the active reminder."
          },
          delaySeconds: {
            type: "integer",
            minimum: 0,
            maximum: 31536000,
            description:
              "Delay from execution, in seconds. Supply this OR date/time."
          },
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
        required: ["operation"]
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
        "Changes the scheduled time of an existing pending task. For relative time supply delaySeconds instead of date/time; the backend calculates the timestamp. Use getTasks first when the user identifies a task by description rather than task ID. The task must already exist and be pending. Use fresh clock context for calendar references. Never invent the date, time, or timezone. Do not create a new task when rescheduling an existing one.",
      parameters: {
        type: "object",
        properties: {
          delaySeconds: {
            type: "integer",
            minimum: 0,
            maximum: 31536000,
            description:
              "Delay from execution, in seconds. Supply this OR date/time."
          },
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
        required: []
      }
    }
  }
];
