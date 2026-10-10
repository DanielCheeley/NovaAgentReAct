import { getWeatherDescription } from "./helperFunctions/describeWeatherCodes";
import { geocodeLocation } from "./helperFunctions/geocodeLocation";

type WeatherResponse = {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
};

export async function getWeather({
  location,
  state,
  country
}: {
  location: string;
  state?: string;
  country?: string;
}) {
  try {
    // Find the requested location
    const locationResult = await geocodeLocation({
      location,
      state,
      country
    });

    // Location could not be resolved
    if (locationResult.status !== "success") {
      return locationResult;
    }

    const place = locationResult.place;

    // Get current weather
    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?` +
        `latitude=${place.latitude}` +
        `&longitude=${place.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m` +
        `&temperature_unit=fahrenheit` +
        `&wind_speed_unit=mph`
    );

    if (!weatherResponse.ok) {
      throw new Error("Failed to get weather");
    }

    const weatherData = (await weatherResponse.json()) as WeatherResponse;

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
