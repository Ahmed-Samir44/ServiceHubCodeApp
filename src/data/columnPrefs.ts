/**
 * Per-view grid preferences ("Edit columns", "Column width", "Move left/right"), stored in this
 * browser only — nothing is written back to the Dataverse view. Reset returns to the view's layout.
 */
export interface ColumnPrefs {
  /** Column order/selection; absent = the view's own columns. */
  columns?: string[];
  /** Column widths in px set by the user, keyed by column name. */
  widths?: Record<string, number>;
}

const keyFor = (tableLogicalName: string, viewId: string) => `servicehub.columns.${tableLogicalName}.${viewId}`;

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

export function readColumnPrefs(tableLogicalName: string, viewId: string): ColumnPrefs {
  try {
    const stored = window.localStorage.getItem(keyFor(tableLogicalName, viewId));
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    // Earlier versions stored just the column list.
    if (isStringArray(parsed)) return { columns: parsed };
    if (!parsed || typeof parsed !== 'object') return {};
    const record = parsed as Record<string, unknown>;
    const widths: Record<string, number> = {};
    if (record.widths && typeof record.widths === 'object') {
      for (const [name, width] of Object.entries(record.widths as Record<string, unknown>)) {
        if (typeof width === 'number' && width > 0) widths[name] = width;
      }
    }
    return {
      columns: isStringArray(record.columns) ? record.columns : undefined,
      widths: Object.keys(widths).length ? widths : undefined,
    };
  } catch {
    return {};
  }
}

export function writeColumnPrefs(tableLogicalName: string, viewId: string, prefs: ColumnPrefs): void {
  try {
    if (!prefs.columns && !prefs.widths) window.localStorage.removeItem(keyFor(tableLogicalName, viewId));
    else window.localStorage.setItem(keyFor(tableLogicalName, viewId), JSON.stringify(prefs));
  } catch {
    // Storage blocked in the host: the choice still applies for this session.
  }
}
