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
  const get = (type: string) => parts.find((part) => part.type === type)?.value;

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

export async function answerLocalClockQuestion(message: string) {
  const question = (message.split("\n").at(-1) ?? "")
    .replace(/^[\w.-]{1,32}:\s*/u, "")
    .replace(/^nova[\s,!:]+/i, "")
    .replace(/[?.!]+\s*$/, "")
    .trim();

  const asksForTime = /^(?:what time is it(?: now)?|(?:(?:what(?:'s| is)|tell me) the )?(?:current |local )?time)$/i.test(question);
  const asksForDate = /^(?:what(?:'s| is) (?:today'?s date|the (?:current )?date)(?: today)?|what (?:date|day) is it(?: today)?|(?:today'?s |current )?date)$/i.test(question);
  const asksForBoth = /^(?:what (?:time and date|date and time) is it(?: now)?|(?:what(?:'s| is) the )?(?:current |local )?(?:date and time|time and date))$/i.test(question);
  if (!asksForTime && !asksForDate && !asksForBoth) return undefined;

  const { iso, timezone } = await getDateAndTime();
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    ...(asksForDate || asksForBoth ? { dateStyle: "full" as const } : {}),
    ...(asksForTime || asksForBoth ? { timeStyle: "short" as const } : {})
  }).format(new Date(iso));
  return `It's ${formatted} (${timezone}).`;
}
