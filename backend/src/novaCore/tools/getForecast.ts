import { getWeatherDescription } from "./helperFunctions/describeWeatherCodes";
import { geocodeLocation } from "./helperFunctions/geocodeLocation";

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