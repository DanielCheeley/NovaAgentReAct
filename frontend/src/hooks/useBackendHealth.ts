import { useEffect, useState } from "react";
import { BACKEND_URL } from "../communication/api";

export function useBackendHealth() {
  const [isOnline, setIsOnline] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 3000);
    void fetch(`${BACKEND_URL}/health`, {
      signal: controller.signal,
      cache: "no-store"
    })
      .then((response) => {
        if (active) setIsOnline(response.ok);
      })
      .catch(() => {
        if (active) setIsOnline(false);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);
  return isOnline;
}
