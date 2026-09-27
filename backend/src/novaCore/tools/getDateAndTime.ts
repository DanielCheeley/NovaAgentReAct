export async function getDateAndTime() {
  const now = new Date();

  return {
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    iso: now.toISOString()
  }
}