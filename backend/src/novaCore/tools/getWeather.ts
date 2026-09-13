export async function getWeather({location}: {location: string;}) {
  return {
    location,
    temperature: 72,
    condition: "Partly cloudy",
    humidity: 48
  };
}