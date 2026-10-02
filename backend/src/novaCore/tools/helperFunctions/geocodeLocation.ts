export type GeoLocationResult = {
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

export async function geocodeLocation({
  location,
  state,
  country
}: {
  location: string;
  state?: string;
  country?: string;
}) {
  const params = new URLSearchParams({
    name: location,
    count: "100",
    language: "en",
    format: "json"
  });

  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?${params}`
  );

  if (!response.ok) {
    throw new Error("Failed to find location");
  }

  const data =
    await response.json() as GeoLocationResponse;

  if (!data.results || data.results.length === 0) {
    return {
      status: "not_found" as const,
      location,
      state,
      country
    };
  }

  const candidates = data.results.filter((result) =>
    matchesLocation(result, location, state, country)
  );

  if (candidates.length === 0) {
    return {
      status: "not_found" as const,
      location,
      state,
      country
    };
  }

  if (candidates.length > 1) {
    return {
      status: "ambiguous" as const,
      location,
      options: candidates.slice(0, 5).map((place) => ({
        name: place.name,
        state: place.admin1,
        country: place.country
      }))
    };
  }

  return {
    status: "success" as const,
    place: candidates[0]
  };
}