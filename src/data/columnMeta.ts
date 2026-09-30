import { MicrosoftDataverseService } from '../generated';
import { COLUMN_META, type ColumnKind, type RawColumnMeta } from './columnLabels.generated';
import { DATA_ORG_URL } from './config';
import { isPreviewGateway } from './dataverse';

export type { ColumnKind };

export interface ChoiceOption {
  value: number;
  label: string;
}

/** Column metadata from the Dataverse schema, in readable form. */
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

// ---- Live metadata ----
// The build ships a snapshot (columnLabels.generated.ts, from reference/dataverse-schemas). Like the
// model-driven app, a table's columns are also read live from Dataverse when the table opens, so
// columns added later (e.g. a new lookup) work without rebuilding. Same conversion as
// scripts/build-column-labels.mjs; the snapshot stays the fallback when the live read fails.

const KIND: Record<string, ColumnKind> = {
  LookupType: 'lookup',
  OwnerType: 'lookup',
  CustomerType: 'lookup',
  PicklistType: 'choice',
  MultiSelectPicklistType: 'choice',
  StateType: 'choice',
  StatusType: 'choice',
  BooleanType: 'choice',
  DateTimeType: 'date',
  MemoType: 'memo',
  IntegerType: 'number',
  BigIntType: 'number',
  DecimalType: 'number',
  DoubleType: 'number',
  MoneyType: 'number',
};

type SchemaProperty = Record<string, unknown>;

function toRawMeta(properties: Record<string, SchemaProperty>): Record<string, RawColumnMeta> {
  const columns: Record<string, RawColumnMeta> = {};
  for (const [attribute, meta] of Object.entries(properties)) {
    const type = typeof meta['x-ms-dataverse-type'] === 'string' ? meta['x-ms-dataverse-type'] : '';
    if (!type || type === 'VirtualType' || type === 'FileType' || type === 'ImageType') continue;
    const labels = Array.isArray(meta.enum) ? meta.enum : null;
    const values = Array.isArray(meta['x-ms-enum-values']) ? meta['x-ms-enum-values'] : null;
    const column: {
      l: string;
      k: ColumnKind;
      o?: (readonly [number, string])[];
      m?: 1;
      b?: 1;
      r?: 1;
      ro?: 1;
      x?: number;
      s?: string;
    } = { l: typeof meta.title === 'string' ? meta.title : attribute, k: KIND[type] ?? 'text' };
    if (type === 'BooleanType') column.o = [[1, 'Yes'], [0, 'No']];
    else if (labels && values) column.o = values.map((value, index) => [Number(value), String(labels[index] ?? value)] as const);
    if (type === 'MultiSelectPicklistType') column.m = 1;
    if (type === 'BooleanType') column.b = 1;
    if (meta.required === true) column.r = 1;
    if (meta['x-ms-read-only'] === true) column.ro = 1;
    if (typeof meta.maxLength === 'number') column.x = meta.maxLength;
    if ((type === 'LookupType' || type === 'CustomerType') && typeof meta['x-ms-schema-name'] === 'string') column.s = meta['x-ms-schema-name'];
    columns[attribute] = column;
  }
  return columns;
}

const live = new Map<string, Record<string, RawColumnMeta>>();
const liveLoads = new Map<string, Promise<void>>();
/** A slow or unanswered metadata call must not hold the page: the snapshot is used after this. */
const LIVE_META_TIMEOUT_MS = 6000;

/**
 * Reads the table's current columns from Dataverse (once per session). Never rejects: on failure the
 * shipped snapshot is used. Await it before rendering a table's grid or form.
 */
export function loadLiveColumnMeta(tableLogicalName: string, entitySet: string): Promise<void> {
  if (isPreviewGateway()) return Promise.resolve();
  let load = liveLoads.get(tableLogicalName);
  if (!load) {
    const read = MicrosoftDataverseService.GetMetadataForGetEntityWithOrganization(DATA_ORG_URL, entitySet)
      .then((result) => {
        const schema = result.data?.schema as { items?: { properties?: Record<string, SchemaProperty> } } | undefined;
        const properties = schema?.items?.properties;
        if (!result.error && properties && Object.keys(properties).length) live.set(tableLogicalName, toRawMeta(properties));
      })
      .catch(() => undefined);
    load = Promise.race([read, new Promise<void>((resolve) => window.setTimeout(resolve, LIVE_META_TIMEOUT_MS))]);
    liveLoads.set(tableLogicalName, load);
  }
  return load;
}

const metaOf = (tableLogicalName: string) => live.get(tableLogicalName) ?? COLUMN_META[tableLogicalName];

const tidy = (label: string) => label.replace(/\s+/g, ' ').trim();

export function columnMeta(tableLogicalName: string, attribute: string): ColumnMeta | undefined {
  const raw = metaOf(tableLogicalName)?.[attribute];
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
  return Object.keys(metaOf(tableLogicalName) ?? {});
}
