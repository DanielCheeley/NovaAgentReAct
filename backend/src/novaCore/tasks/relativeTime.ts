import { Temporal } from "@js-temporal/polyfill";

export function relativeTaskArguments(
  args: Record<string, unknown>,
  seconds: number,
  now = Date.now()
) {
  const timezone =
    typeof args.timezone === "string"
      ? args.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const time = Temporal.Instant.fromEpochMilliseconds(
    now + seconds * 1000
  ).toZonedDateTimeISO(timezone);
  return {
    ...args,
    timezone,
    date: time.toPlainDate().toString(),
    time: time.toPlainTime().toString({ smallestUnit: "second" })
  };
}
