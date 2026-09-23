import { getWeatherDescription } from "./helperFunctions/describeWeatherCodes";
export async function getForecast({
  location,
  state,
  country
}: {
  location: string;
  state?: string;
  country?: string;
}) {
  try {
    // Find location coordinates
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

    // Use the same location-selection logic you already have
    const candidates = geoLocationData.results.filter(
      (result: any) =>
        result.name?.toLowerCase() === location.toLowerCase() &&
        (!state ||
          result.admin1?.toLowerCase() === state.toLowerCase())
    );

    if (candidates.length === 0) {
      if (state) {
        throw new Error(
          `Could not find ${location} in ${state}`
        );
      }

    throw new Error(`Location not found: ${location}`);
    }

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

    // Get forecast
    const forecastParams = new URLSearchParams({
      latitude: place.latitude.toString(),
      longitude: place.longitude.toString(),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max",
        "wind_speed_10m_max"
      ].join(","),
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      forecast_days: "7",
      timezone: "auto"
    });

    const forecastResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?${forecastParams}`
    );

    if (!forecastResponse.ok) {
      throw new Error("Failed to get forecast");
    }

    const forecastData = await forecastResponse.json();

    return {
      status: "success",
      location: `${place.name}, ${place.admin1 ?? place.country}`,
      //structed forecast so nova can read it easier
      forecast: forecastData.daily.time.map(
      (date: string, index: number) => ({
        date,
        condition: getWeatherDescription(forecastData.daily.weather_code[index]),
        high: forecastData.daily.temperature_2m_max[index],
        low: forecastData.daily.temperature_2m_min[index],
        precipitationProbability:
          forecastData.daily.precipitation_probability_max[index],
        maxWindSpeed:
          forecastData.daily.wind_speed_10m_max[index]
      })
      )
    };
  } catch (error) {
    console.error("forecast fetch error:", error);
    throw error;
  }
}