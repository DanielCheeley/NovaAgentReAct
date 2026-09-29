import { getWeatherDescription } from "./helperFunctions/describeWeatherCodes";

type GeoLocationResult = {
  name: string;
  admin1?: string;
  country?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
};

type GeoLocationResponse = {
  results?: GeoLocationResult[];
};

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

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'’-]/g, "")
    .replace(/\bsaint\b/g, "st")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesLocation(
  result: GeoLocationResult,
  location: string,
  state?: string,
  country?: string
) {
  const locationMatches =
    normalizeName(result.name) === normalizeName(location);

  const stateMatches =
    !state ||
    normalizeName(result.admin1 ?? "") === normalizeName(state);

  const countryMatches =
    !country ||
    normalizeName(result.country ?? "") === normalizeName(country);

  return locationMatches && stateMatches && countryMatches;
}

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
    // Search primarily by the location name.
    // We use state/country later to select the correct result.
    const params = new URLSearchParams({
      name: location,
      count: "100",
      language: "en",
      format: "json"
    });

    const geoLocationResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${params}`
    );

    if (!geoLocationResponse.ok) {
      throw new Error("Failed to find location");
    }

    const geoLocationData =
      await geoLocationResponse.json() as GeoLocationResponse;

    if (
      !geoLocationData.results ||
      geoLocationData.results.length === 0
    ) {
      throw new Error(`Location not found: ${location}`);
    }

    const candidates = geoLocationData.results.filter((result) =>
      matchesLocation(result, location, state, country)
    );

    // No exact location match
    if (candidates.length === 0) {
      return {
        status: "not_found",
        location,
        state,
        country
      };
    }

    // Multiple exact matches means Nova needs more information
    if (candidates.length > 1) {
      return {
        status: "ambiguous",
        location,
        options: candidates.slice(0, 5).map((place) => ({
          name: place.name,
          state: place.admin1,
          country: place.country
        }))
      };
    }

    const place = candidates[0];

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

    const weatherData =
      await weatherResponse.json() as WeatherResponse;

    return {
      status: "success",
      location: `${place.name}, ${place.admin1 ?? place.country}`,
      temperature: weatherData.current.temperature_2m,
      feelsLike: weatherData.current.apparent_temperature,
      humidity: weatherData.current.relative_humidity_2m,
      condition: getWeatherDescription(
        weatherData.current.weather_code
      ),
      windSpeed: weatherData.current.wind_speed_10m,
      windDirection: weatherData.current.wind_direction_10m
    };
  } catch (error) {
    console.error("weather fetch error:", error);
    throw error;
  }
}