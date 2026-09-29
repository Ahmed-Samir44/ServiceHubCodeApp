export type Region = 'EGY' | 'KSA';

export const REGIONS: readonly Region[] = ['EGY', 'KSA'];

export const REGION_LABEL: Record<Region, string> = {
  EGY: 'Egypt',
  KSA: 'Saudi Arabia',
};

/** Two-letter mark shown in the gold region badge (flag emoji do not render on Windows). */
export const REGION_MARK: Record<Region, string> = {
  EGY: 'EG',
  KSA: 'SA',
};

/** Dataverse choice value of the `cr18c_region` / `cr18c_regionchoice` columns. */
export const REGION_CHOICE_VALUE: Record<Region, number> = {
  EGY: 983080000,
  KSA: 983080001,
};

/** Price currency shown next to fees and prices. */
export const REGION_CURRENCY: Record<Region, string> = {
  EGY: 'LE',
  KSA: 'SAR',
};

export const isRegion = (value: unknown): value is Region =>
  value === 'EGY' || value === 'KSA';
