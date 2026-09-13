import { NovaEvent } from "../../types/eventType";

type EventHandler = (event: NovaEvent) => void;

const handlers = new Map<string, EventHandler[]>();

export function on(
  eventType: string,
  handler: EventHandler
) : void {
  const existingHandlers = handlers.get(eventType) ?? [];

  existingHandlers.push(handler);

  handlers.set(eventType,existingHandlers);
}

export function emit(event: NovaEvent): void {
  const eventHandlers = handlers.get(event.type);

  if(!eventHandlers) {
    return;
  }

  for(const handler of eventHandlers) {
    handler(event);
  }
}