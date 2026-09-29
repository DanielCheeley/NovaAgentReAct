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

type ForecastResponse = {
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
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

    // No matching location
    if (candidates.length === 0) {
      return {
        status: "not_found",
        location,
        state,
        country
      };
    }

    // Multiple matching locations
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

    const forecastData =
      await forecastResponse.json() as ForecastResponse;

    return {
      status: "success",
      location: `${place.name}, ${place.admin1 ?? place.country}`,

      forecast: forecastData.daily.time.map(
        (date, index) => ({
          date,
          condition: getWeatherDescription(
            forecastData.daily.weather_code[index]
          ),
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