import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const getMatches = () => {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState<boolean>(() => getMatches());

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;

    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);

    if ("addEventListener" in mql) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }

    const legacy = mql as unknown as {
      addListener: (listener: (e: MediaQueryListEvent) => void) => void;
      removeListener: (listener: (e: MediaQueryListEvent) => void) => void;
    };
    legacy.addListener(onChange);
    return () => legacy.removeListener(onChange);
  }, [query]);

  return matches;
}

