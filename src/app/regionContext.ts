import { createContext, useContext } from 'react';
import type { Region } from './region';

export interface RegionContextValue {
  /** null until the user picks a region (first visit in this session), like the legacy page. */
  region: Region | null;
  setRegion: (region: Region) => void;
}

export const RegionContext = createContext<RegionContextValue | null>(null);

export function useRegionContext(): RegionContextValue {
  const value = useContext(RegionContext);
  if (!value) throw new Error('useRegionContext must be used inside <RegionProvider>.');
  return value;
}

/** Selected region for screens, which only render once a region has been chosen. */
export function useRegion(): Region {
  const { region } = useRegionContext();
  if (!region) throw new Error('useRegion called before a region was selected.');
  return region;
}
