export async function getDateAndTime() {
  const now = new Date();

  return {
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString()
  }
}