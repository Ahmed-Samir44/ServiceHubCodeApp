import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { isRegion, type Region } from './region';
import { RegionContext } from './regionContext';

// Same key as the legacy web resource, so a user's last region carries over within a session.
const STORAGE_KEY = 'selectedRegion';

function readStoredRegion(): Region | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return isRegion(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function RegionProvider({ children }: { children: ReactNode }) {
  const [region, setRegionState] = useState<Region | null>(readStoredRegion);

  const setRegion = useCallback((next: Region) => {
    setRegionState(next);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked inside the Power Apps host; the in-memory value still applies.
    }
  }, []);

  const value = useMemo(() => ({ region, setRegion }), [region, setRegion]);
  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}
