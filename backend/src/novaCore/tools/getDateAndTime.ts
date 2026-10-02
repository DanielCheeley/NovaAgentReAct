export async function getDateAndTime() {
  const now = new Date();

  // Get the computer's IANA timezone, such as "America/Chicago". 
  // This tells Nova which timezone the local date and time belong to.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Break the current date and time into individual parts.
  // We explicitly specify the timezone so the values represent local time, rather than UTC.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  // Find a specific part from the formatted date/time. For example, get("year") returns "2026".
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value;

  return {
    // Local calendar date in a predictable format: YYYY-MM-DD.
    date: `${get("year")}-${get("month")}-${get("day")}`,
    // Local time in a predictable 24-hour format: HH:mm:ss.
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
    // The timezone the local date and time belong to.
    timezone,
    iso: now.toISOString()
  };
}