/**
 * Per-user display preferences kept in localStorage (browser-only conveniences; a blocked or
 * cleared storage just falls back to the defaults).
 */

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preference just won't persist.
  }
}

// ---- Text size (call-center agents work on it all day, so it starts larger than base.css) ----

export const TEXT_SIZES = [
  { id: 'normal', label: 'A', title: 'Normal text', zoom: 1 },
  { id: 'large', label: 'A', title: 'Large text', zoom: 1.15 },
  { id: 'xlarge', label: 'A', title: 'Extra large text', zoom: 1.3 },
] as const;

export type TextSizeId = (typeof TEXT_SIZES)[number]['id'];

const TEXT_SIZE_KEY = 'servicehub.textsize';
// Synapse's 14px base already matches the old "Large" size, so Normal is the default.
export const DEFAULT_TEXT_SIZE: TextSizeId = 'normal';

export function readTextSize(): TextSizeId {
  const stored = read(TEXT_SIZE_KEY);
  return TEXT_SIZES.some((size) => size.id === stored) ? (stored as TextSizeId) : DEFAULT_TEXT_SIZE;
}

export const writeTextSize = (size: TextSizeId) => write(TEXT_SIZE_KEY, size);

export const textZoom = (size: TextSizeId) => TEXT_SIZES.find((item) => item.id === size)?.zoom ?? 1;

/**
 * The CSS zoom applied to an element (1 when unsupported). Pointer coordinates and
 * getBoundingClientRect are in viewport pixels, while sizes/positions set inside a zoomed element
 * are multiplied by the zoom, so divide by this when converting between them.
 */
export function cssZoom(element: Element): number {
  const zoom = (element as Element & { currentCSSZoom?: number }).currentCSSZoom;
  return typeof zoom === 'number' && zoom > 0 ? zoom : 1;
}

// ---- Doctors Directory: cards per row ----

export const DOCTOR_COLUMN_CHOICES = [2, 3, 4] as const;
const DOCTOR_COLUMNS_KEY = 'servicehub.doctors.perRow';
export const DEFAULT_DOCTOR_COLUMNS = 4;

export function readDoctorColumns(): number {
  const stored = Number(read(DOCTOR_COLUMNS_KEY));
  return (DOCTOR_COLUMN_CHOICES as readonly number[]).includes(stored) ? stored : DEFAULT_DOCTOR_COLUMNS;
}

export const writeDoctorColumns = (columns: number) => write(DOCTOR_COLUMNS_KEY, String(columns));




