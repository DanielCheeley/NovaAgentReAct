import { getWeatherDescription } from "./helperFunctions/describeWeatherCodes";
export async function getWeather({
  location,
  state,
  country
}: {
  location: string;
  state?: string;
  country?: string;
}) {
  // Find requested location coordinates
  try {
    const searchName = [location, state, country]
      .filter(Boolean)
      .join(", ");

    const params = new URLSearchParams({
      name: searchName,
      count: "10",
      language: "en",
      format: "json"
    });

    const geoLocationResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${params}`
    );

    if (!geoLocationResponse.ok) {
      throw new Error("Failed to find location");
    }

    const geoLocationData = await geoLocationResponse.json();

    if (
      !geoLocationData.results ||
      geoLocationData.results.length === 0
    ) {
      throw new Error(`Location not found: ${location}`);
    }

    // Find places that match the requested location and state
    const candidates = geoLocationData.results.filter(
      (result: any) =>
        result.name?.toLowerCase() === location.toLowerCase() &&
        (!state ||
          result.admin1?.toLowerCase() === state.toLowerCase())
    );

    // If a state was provided but nothing matched it
    if (candidates.length === 0) {
      if (state) {
      throw new Error(
        `Could not find ${location} in ${state}`
      );
    }

    throw new Error(`Location not found: ${location}`);
    }

    // If there are multiple possible locations and
    // the user didn't provide enough information, ask for clarification
    if (!state && candidates.length > 1) {
      return {
        status: "ambiguous",
        location,
        options: candidates.slice(0, 5).map((place: any) => ({
          name: place.name,
          state: place.admin1,
          country: place.country
        }))
      };
    }

    const place = candidates[0];

    // Get current weather
    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`
    );

    if (!weatherResponse.ok) {
      throw new Error("Failed to get weather");
    }

    const weatherData = await weatherResponse.json();

    return {
      status: "success",
      location: `${place.name}, ${place.admin1 ?? place.country}`,
      temperature: weatherData.current.temperature_2m,
      feelsLike: weatherData.current.apparent_temperature,
      humidity: weatherData.current.relative_humidity_2m,
      condition: getWeatherDescription(weatherData.current.weather_code),
      windSpeed: weatherData.current.wind_speed_10m,
      windDirection: weatherData.current.wind_direction_10m
    };
  } catch (error) {
    console.error("weather fetch error:", error);
    throw error;
  }
}