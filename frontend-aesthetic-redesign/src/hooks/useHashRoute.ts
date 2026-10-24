import { useCallback, useEffect, useState } from "react";

export type Route = "dashboard" | "projector";

function readRoute(): Route {
  return window.location.hash.replace(/^#\/?/, "") === "projector" ? "projector" : "dashboard";
}

/**
 * Two views, one page: the control dashboard and the projector. A hash route
 * makes the projector deep-linkable (and openable in a second window) without
 * pulling in a router for two states.
 */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = useCallback((next: Route) => {
    // replaceState avoids stacking dozens of entries as the professor toggles
    // between the console and the projector.
    const url = `${window.location.pathname}${window.location.search}${
      next === "projector" ? "#projector" : ""
    }`;
    window.history.replaceState(null, "", url);
    setRoute(next);
  }, []);

  return { route, navigate };
}
