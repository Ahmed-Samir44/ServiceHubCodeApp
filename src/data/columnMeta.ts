import { COLUMN_META, type ColumnKind } from './columnLabels.generated';

export type { ColumnKind };

export interface ChoiceOption {
  value: number;
  label: string;
}

/** Column metadata from the Dataverse schema (reference/dataverse-schemas), in readable form. */
export interface ColumnMeta {
  name: string;
  label: string;
  kind: ColumnKind;
  /** Choice / two-option / status values with their labels. */
  options: ChoiceOption[];
  multiSelect: boolean;
  twoOption: boolean;
  required: boolean;
  readOnly: boolean;
  maxLength?: number;
  /** Lookup navigation property used for `@odata.bind` when saving. */
  navigationProperty?: string;
}

const tidy = (label: string) => label.replace(/\s+/g, ' ').trim();

export function columnMeta(tableLogicalName: string, attribute: string): ColumnMeta | undefined {
  const raw = COLUMN_META[tableLogicalName]?.[attribute];
  if (!raw) return undefined;
  return {
    name: attribute,
    label: tidy(raw.l),
    kind: raw.k,
    options: (raw.o ?? []).map(([value, label]) => ({ value, label })),
    multiSelect: raw.m === 1,
    twoOption: raw.b === 1,
    required: raw.r === 1,
    readOnly: raw.ro === 1,
    maxLength: raw.x,
    navigationProperty: raw.s,
  };
}

/** All attribute names the schema knows for a table. */
export function tableAttributes(tableLogicalName: string): string[] {
  return Object.keys(COLUMN_META[tableLogicalName] ?? {});
}
