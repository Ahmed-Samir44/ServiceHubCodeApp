import { MicrosoftDataverseService } from '../generated';
import { COLUMN_META, type ColumnKind, type RawColumnMeta } from './columnLabels.generated';
import { DATA_ORG_URL } from './config';
import { isPreviewGateway, listRows } from './dataverse';

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
// columns added later (e.g. a new lookup) work without rebuilding. The snapshot stays the source
// for the columns it knows, and the fallback when the live read fails.

type SchemaProperty = Record<string, unknown>;

const live = new Map<string, Record<string, RawColumnMeta>>();
const liveLoads = new Map<string, Promise<void>>();
/** A slow or unanswered metadata call must not hold the page: the snapshot is used after this. */
const LIVE_META_TIMEOUT_MS = 6000;

/** What the live read did per table (shown in development to diagnose it). */
export const liveMetaStatus = new Map<string, string>();

type MutableRawMeta = { -readonly [key in keyof RawColumnMeta]: RawColumnMeta[key] };

const ATTRIBUTE_KIND: Record<string, ColumnKind> = {
  Lookup: 'lookup',
  Owner: 'lookup',
  Customer: 'lookup',
  Picklist: 'choice',
  State: 'choice',
  Status: 'choice',
  Boolean: 'choice',
  DateTime: 'date',
  Memo: 'memo',
  Integer: 'number',
  BigInt: 'number',
  Decimal: 'number',
  Double: 'number',
  Money: 'number',
  String: 'text',
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Columns from Dataverse attribute metadata (EntityDefinitions/Attributes): type, label, required,
 * read-only and, for lookups, the schema name used as the @odata.bind navigation property.
 */
async function attributeMetadata(tableLogicalName: string): Promise<Record<string, RawColumnMeta>> {
  const { rows } = await listRows({
    entitySet: `EntityDefinitions(LogicalName='${tableLogicalName}')/Attributes`,
    select: 'LogicalName,AttributeType,SchemaName,DisplayName,RequiredLevel,IsValidForCreate,IsValidForUpdate,AttributeOf',
  });
  const columns: Record<string, RawColumnMeta> = {};
  for (const row of rows) {
    const name = text(row.LogicalName);
    const type = text(row.AttributeType);
    const kind = ATTRIBUTE_KIND[type];
    // AttributeOf: companion columns (lookup name / yomi fields), not shown on their own.
    if (!name || !kind || row.AttributeOf) continue;
    const display = row.DisplayName as { UserLocalizedLabel?: { Label?: string } | null } | undefined;
    const column: MutableRawMeta = { l: display?.UserLocalizedLabel?.Label || name, k: kind };
    if (type === 'Boolean') {
      column.o = [[1, 'Yes'], [0, 'No']];
      column.b = 1;
    }
    const required = (row.RequiredLevel as { Value?: string } | undefined)?.Value;
    if (required === 'ApplicationRequired' || required === 'SystemRequired') column.r = 1;
    if (row.IsValidForCreate === false && row.IsValidForUpdate === false) column.ro = 1;
    if ((type === 'Lookup' || type === 'Customer') && text(row.SchemaName)) column.s = text(row.SchemaName);
    columns[name] = column;
  }
  return columns;
}

/**
 * Fallback when attribute metadata can't be read: the connector's "get a row" schema lists every
 * column by its Web API name with a title, but no Dataverse type. Lookups are recognisable
 * (`_x_value`, "Label (Value)"); other columns get a kind from the JSON type. No navigation
 * property here, so a new lookup found this way shows read-only.
 */
function fromRowSchema(properties: Record<string, SchemaProperty>): Record<string, RawColumnMeta> {
  const columns: Record<string, RawColumnMeta> = {};
  for (const [key, meta] of Object.entries(properties)) {
    if (key.includes('@')) continue;
    const title = text(meta.title);
    const lookup = /^_(.+)_value$/.exec(key);
    if (lookup) {
      columns[lookup[1]] = { l: title.replace(/\s*\(Value\)$/i, '') || lookup[1], k: 'lookup' };
      continue;
    }
    if (key.startsWith('_')) continue;
    const jsonType = text(meta.type);
    const kind: ColumnKind = jsonType === 'integer' || jsonType === 'number' ? 'number' : text(meta.format) === 'date-time' ? 'date' : jsonType === 'boolean' ? 'choice' : 'text';
    columns[key] = jsonType === 'boolean' ? { l: title || key, k: kind, o: [[1, 'Yes'], [0, 'No']], b: 1 } : { l: title || key, k: kind };
  }
  return columns;
}

async function readLiveColumns(tableLogicalName: string, entitySet: string): Promise<{ columns: Record<string, RawColumnMeta>; source: string }> {
  try {
    const columns = await attributeMetadata(tableLogicalName);
    if (Object.keys(columns).length) return { columns, source: 'attribute metadata' };
  } catch (error) {
    liveMetaStatus.set(tableLogicalName, `attribute metadata failed (${error instanceof Error ? error.message : String(error)})`);
  }
  const result = await MicrosoftDataverseService.GetMetadataForGetEntityWithOrganization(DATA_ORG_URL, entitySet);
  const properties = result.error ? null : schemaProperties(result.data);
  return { columns: properties ? fromRowSchema(properties) : {}, source: 'row schema' };
}

/** The column properties, wherever the connector puts them (schema.properties or schema.items.properties). */
function schemaProperties(data: unknown): Record<string, SchemaProperty> | null {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const schema = root?.schema && typeof root.schema === 'object' ? (root.schema as Record<string, unknown>) : root;
  const items = schema?.items && typeof schema.items === 'object' ? (schema.items as Record<string, unknown>) : null;
  const properties = (items?.properties ?? schema?.properties) as Record<string, SchemaProperty> | undefined;
  return properties && typeof properties === 'object' && Object.keys(properties).length ? properties : null;
}

/**
 * Reads the table's current columns from Dataverse (once per session) and adds the ones the shipped
 * snapshot doesn't know (new columns). Columns in the snapshot keep its fuller data (choice options,
 * max lengths). Never rejects; await it before rendering a table's grid or form.
 */
export function loadLiveColumnMeta(tableLogicalName: string, entitySet: string): Promise<void> {
  if (isPreviewGateway()) return Promise.resolve();
  let load = liveLoads.get(tableLogicalName);
  if (!load) {
    const read = readLiveColumns(tableLogicalName, entitySet)
      .then(({ columns, source }) => {
        const snapshot = COLUMN_META[tableLogicalName] ?? {};
        const added = Object.keys(columns).filter((name) => !snapshot[name]);
        live.set(tableLogicalName, { ...Object.fromEntries(added.map((name) => [name, columns[name]])), ...snapshot });
        const previous = liveMetaStatus.get(tableLogicalName);
        const detail = added.map((name) => `${name} (${columns[name].k}${columns[name].s ? `, saves as ${columns[name].s}` : ''})`).join(', ');
        liveMetaStatus.set(tableLogicalName, `${previous ? `${previous}; ` : ''}${source}: ${Object.keys(columns).length} columns, new: ${detail || 'none'}`);
      })
      .catch((error: unknown) => {
        liveMetaStatus.set(tableLogicalName, `failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    load = Promise.race([
      read,
      new Promise<void>((resolve) =>
        window.setTimeout(() => {
          if (!liveMetaStatus.has(tableLogicalName)) liveMetaStatus.set(tableLogicalName, 'timed out, using the snapshot');
          resolve();
        }, LIVE_META_TIMEOUT_MS),
      ),
    ]);
    liveLoads.set(tableLogicalName, load);
  }
  return load;
}

const metaOf = (tableLogicalName: string): Record<string, RawColumnMeta> | undefined => live.get(tableLogicalName) ?? COLUMN_META[tableLogicalName];

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
