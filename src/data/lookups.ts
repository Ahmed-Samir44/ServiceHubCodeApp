import { MicrosoftDataverseService } from '../generated';
import { findTable } from '../app/navigation';
import { DATA_ORG_URL } from './config';
import { listRows, type DataverseRow } from './dataverse';

/**
 * Lookup editing needs, for each lookup column: the table it points to, and that table's entity
 * set + primary name column. The saved schemas don't include lookup targets, so:
 *  1. the target is read from `lookuplogicalname` on the record being edited, or else from any
 *     record that has the lookup filled in;
 *  2. the target's entity set / primary name come from ServiceHub's own tables, a few well-known
 *     system tables, or the connector's table metadata.
 */

export interface LookupTable {
  logicalName: string;
  entitySet: string;
  primaryName: string;
}

export interface LookupOption {
  id: string;
  name: string;
}

const LOOKUP_TABLE_ANNOTATION = '@Microsoft.Dynamics.CRM.lookuplogicalname';

const SYSTEM_TABLES: Record<string, LookupTable> = {
  businessunit: { logicalName: 'businessunit', entitySet: 'businessunits', primaryName: 'name' },
  systemuser: { logicalName: 'systemuser', entitySet: 'systemusers', primaryName: 'fullname' },
  team: { logicalName: 'team', entitySet: 'teams', primaryName: 'name' },
  account: { logicalName: 'account', entitySet: 'accounts', primaryName: 'name' },
  contact: { logicalName: 'contact', entitySet: 'contacts', primaryName: 'fullname' },
  transactioncurrency: { logicalName: 'transactioncurrency', entitySet: 'transactioncurrencies', primaryName: 'currencyname' },
};

/** Candidate entity-set names for a logical name (Dataverse pluralization). */
function entitySetCandidates(logicalName: string): string[] {
  const candidates = [`${logicalName}s`, `${logicalName}es`];
  if (logicalName.endsWith('y')) candidates.unshift(`${logicalName.slice(0, -1)}ies`);
  return candidates;
}

interface SchemaItems {
  'x-ms-dataverse-entityset'?: string;
  'x-ms-dataverse-primary-name'?: string;
}

async function metadataFor(logicalName: string): Promise<LookupTable | null> {
  for (const entitySet of entitySetCandidates(logicalName)) {
    try {
      const result = await MicrosoftDataverseService.GetMetadataForGetEntityWithOrganization(DATA_ORG_URL, entitySet);
      const schema = result.data?.schema as { items?: SchemaItems } | undefined;
      const items = schema?.items;
      if (!result.error && items?.['x-ms-dataverse-primary-name']) {
        return { logicalName, entitySet: items['x-ms-dataverse-entityset'] ?? entitySet, primaryName: items['x-ms-dataverse-primary-name'] };
      }
    } catch {
      // try the next plural form
    }
  }
  return null;
}

const tableCache = new Map<string, Promise<LookupTable | null>>();

export function lookupTableInfo(logicalName: string): Promise<LookupTable | null> {
  const known = findTable(logicalName)?.table ?? SYSTEM_TABLES[logicalName];
  if (known) return Promise.resolve({ logicalName, entitySet: known.entitySet, primaryName: known.primaryName });
  let cached = tableCache.get(logicalName);
  if (!cached) {
    cached = metadataFor(logicalName);
    tableCache.set(logicalName, cached);
  }
  return cached;
}

const targetCache = new Map<string, Promise<string | null>>();

/** Table a lookup column points to (from the record, or from any record that has it set). */
export function lookupTargetTable(entitySet: string, tableLogicalName: string, attribute: string, record?: DataverseRow): Promise<string | null> {
  const fromRecord = record?.[`_${attribute}_value${LOOKUP_TABLE_ANNOTATION}`];
  if (typeof fromRecord === 'string') return Promise.resolve(fromRecord);
  const key = `${tableLogicalName}.${attribute}`;
  let cached = targetCache.get(key);
  if (!cached) {
    const fetchXml = `<fetch top="1"><entity name="${tableLogicalName}"><attribute name="${attribute}" /><filter><condition attribute="${attribute}" operator="not-null" /></filter></entity></fetch>`;
    cached = listRows({ entitySet, fetchXml })
      .then(({ rows }) => {
        const target = rows[0]?.[`_${attribute}_value${LOOKUP_TABLE_ANNOTATION}`];
        return typeof target === 'string' ? target : null;
      })
      .catch(() => null);
    targetCache.set(key, cached);
  }
  return cached;
}

/** Records of the lookup's table whose name contains the text (top 15, active first). */
export async function searchLookup(target: LookupTable, text: string): Promise<LookupOption[]> {
  const id = `${target.logicalName}id`;
  const escaped = text.replace(/'/g, "''");
  const { rows } = await listRows({
    entitySet: target.entitySet,
    select: `${id},${target.primaryName}`,
    filter: text.trim() ? `contains(${target.primaryName},'${escaped}')` : undefined,
    orderBy: `${target.primaryName} asc`,
    top: 15,
  });
  return rows
    .map((row) => ({ id: String(row[id] ?? ''), name: String(row[target.primaryName] ?? '') }))
    .filter((option) => option.id);
}
