import { Temporal } from "@js-temporal/polyfill";

export type TaskTime = { date: string; time: string; timezone: string };

export function resolveTaskTime({ date, time, timezone }: TaskTime) {
  const zonedDateTime = Temporal.ZonedDateTime.from(
    `${date}T${time}[${timezone}]`
  );
  return { zonedDateTime, runAt: new Date(zonedDateTime.epochMilliseconds) };
}
