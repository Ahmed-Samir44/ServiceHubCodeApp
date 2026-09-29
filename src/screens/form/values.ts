import { columnMeta, type ColumnMeta } from '../../data/columnMeta';
import type { DataverseRow } from '../../data/dataverse';
import type { FormField } from '../../data/forms';
import { lookupTableInfo } from '../../data/lookups';
import type { DraftValue, LookupValue } from './FieldEditor';

// System columns the model-driven form never lets users type into.
export const SYSTEM_READ_ONLY = new Set([
  'createdon', 'modifiedon', 'createdby', 'modifiedby', 'createdonbehalfby', 'modifiedonbehalfby',
  'ownerid', 'owningbusinessunit', 'statecode', 'statuscode', 'versionnumber',
]);

/** Schema metadata for a form field (a neutral text column when the schema doesn't know it). */
export const metaFor = (tableLogicalName: string, field: FormField): ColumnMeta =>
  columnMeta(tableLogicalName, field.name) ?? {
    name: field.name, label: field.label, kind: field.kind, options: [], multiSelect: false, twoOption: false, required: false, readOnly: false,
  };

export const isEmptyValue = (value: DraftValue) => value === null || value === '' || (Array.isArray(value) && !value.length);

/** Editor value for a field from a loaded record. */
export function currentValue(row: DataverseRow, meta: ColumnMeta): DraftValue {
  if (meta.kind === 'lookup') {
    const id = row[`_${meta.name}_value`];
    if (typeof id !== 'string') return null;
    const name = row[`_${meta.name}_value@OData.Community.Display.V1.FormattedValue`];
    const table = row[`_${meta.name}_value@Microsoft.Dynamics.CRM.lookuplogicalname`];
    return { id, name: typeof name === 'string' ? name : id, table: typeof table === 'string' ? table : '' };
  }
  const raw = row[meta.name];
  if (raw === null || raw === undefined) return meta.multiSelect ? [] : '';
  if (meta.multiSelect) return String(raw).split(',').filter(Boolean);
  if (meta.kind === 'date') return String(raw).slice(0, 10);
  if (typeof raw === 'boolean') return raw ? '1' : '0';
  return String(raw);
}

/** Editor value -> Web API value for create/update (non-lookup columns). */
function toDataverse(meta: ColumnMeta, value: DraftValue): unknown {
  if (isEmptyValue(value)) return null;
  if (meta.multiSelect && Array.isArray(value)) return value.join(',');
  if (typeof value !== 'string') return null;
  if (meta.twoOption) return value === '1';
  if (meta.kind === 'choice' || meta.kind === 'number') return Number(value);
  return value;
}

/** Changed fields -> Web API payload; lookups become `Nav@odata.bind` (or null to clear). */
export async function buildPayload(tableLogicalName: string, draft: Record<string, DraftValue>): Promise<DataverseRow> {
  const payload: DataverseRow = {};
  for (const [name, value] of Object.entries(draft)) {
    const meta = columnMeta(tableLogicalName, name);
    if (!meta) continue;
    if (meta.kind !== 'lookup') {
      payload[name] = toDataverse(meta, value);
      continue;
    }
    if (!meta.navigationProperty) continue;
    const lookup = value as LookupValue | null;
    if (!lookup) {
      payload[`${meta.navigationProperty}@odata.bind`] = null;
      continue;
    }
    const info = await lookupTableInfo(lookup.table);
    if (!info) throw new Error(`Can't save ${meta.label}: the ${lookup.table} table isn't available.`);
    payload[`${meta.navigationProperty}@odata.bind`] = `/${info.entitySet}(${lookup.id})`;
  }
  return payload;
}
