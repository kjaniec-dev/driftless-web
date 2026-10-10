import { useSyncExternalStore } from "react";

export const ROUTES = ["/", "/portfolio", "/edit", "/rebalance", "/data", "/privacy"] as const;
export type Route = (typeof ROUTES)[number];

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const snapshot = () => window.location.hash;

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : "/";
}

/** Hash routing keeps deep links working on static hosting with no server rewrites. */
export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, snapshot, () => ""));
}

export const href = (route: Route) => `#${route}`;
export const navigate = (route: Route) => {
  window.location.hash = route;
};
