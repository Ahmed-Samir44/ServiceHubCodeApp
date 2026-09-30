import { MicrosoftDataverseService } from '../generated';
import { findTable } from '../app/navigation';
import { columnMeta, loadLiveColumnMeta } from './columnMeta';
import { DATA_ORG_URL } from './config';
import { listRows, type DataverseRow } from './dataverse';
import { loadQuickFindColumns } from './views';

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
  /** Extra columns of the Lookup View, shown under the name. */
  detail?: string;
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
  // Dataverse table metadata: entity set and primary name column.
  try {
    const { rows } = await listRows({ entitySet: 'EntityDefinitions', select: 'LogicalName,EntitySetName,PrimaryNameAttribute', filter: `LogicalName eq '${logicalName}'` });
    const row = rows[0];
    if (typeof row?.EntitySetName === 'string' && typeof row.PrimaryNameAttribute === 'string' && row.PrimaryNameAttribute) {
      return { logicalName, entitySet: row.EntitySetName, primaryName: row.PrimaryNameAttribute };
    }
  } catch {
    // fall back to the connector's table schema below
  }
  for (const entitySet of entitySetCandidates(logicalName)) {
    try {
      const result = await MicrosoftDataverseService.GetMetadataForGetEntityWithOrganization(DATA_ORG_URL, entitySet);
      // The table annotations sit on schema.items (list shape) or on schema itself (single row).
      const schema = result.data?.schema as (SchemaItems & { items?: SchemaItems }) | undefined;
      const items = schema?.items?.['x-ms-dataverse-primary-name'] ? schema.items : schema;
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

/** The table a lookup points to, from Dataverse relationship metadata (many-to-one); null if unreadable. */
async function relationshipTarget(tableLogicalName: string, attribute: string): Promise<string | null> {
  try {
    const { rows } = await listRows({
      entitySet: `EntityDefinitions(LogicalName='${tableLogicalName}')/ManyToOneRelationships`,
      select: 'ReferencingAttribute,ReferencedEntity',
      filter: `ReferencingAttribute eq '${attribute}'`,
    });
    const target = rows[0]?.ReferencedEntity;
    if (typeof target === 'string' && target) return target;
  } catch {
    // try the lookup attribute's own targets below
  }
  try {
    const { rows } = await listRows({
      entitySet: `EntityDefinitions(LogicalName='${tableLogicalName}')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata`,
      select: 'LogicalName,Targets',
      filter: `LogicalName eq '${attribute}'`,
    });
    const targets = rows[0]?.Targets;
    return Array.isArray(targets) && typeof targets[0] === 'string' ? targets[0] : null;
  } catch {
    return null;
  }
}

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
      .catch(() => null)
      // No record has it set yet (e.g. a newly added lookup): ask the table's relationship metadata.
      .then((target) => target ?? relationshipTarget(tableLogicalName, attribute));
    targetCache.set(key, cached);
  }
  return cached;
}

interface LookupView {
  /** The view's FetchXML (its filters and sort), or null when the table has no lookup view. */
  fetchXml: string | null;
  /** The view's columns other than the primary name, in view order. */
  columns: string[];
}

const lookupViewCache = new Map<string, Promise<LookupView>>();

/**
 * The target table's Lookup View (savedquery querytype 64, the default one): what the model-driven
 * lookup searches (its filters and sort) and shows (its columns).
 */
function lookupView(target: LookupTable): Promise<LookupView> {
  let cached = lookupViewCache.get(target.logicalName);
  if (!cached) {
    cached = listRows({
      entitySet: 'savedqueries',
      select: 'savedqueryid,isdefault,fetchxml,layoutxml',
      filter: `returnedtypecode eq '${target.logicalName}' and querytype eq 64 and statecode eq 0`,
    })
      .then(({ rows }) => {
        const view = rows.find((row) => row.isdefault === true) ?? rows[0];
        const layout = typeof view?.layoutxml === 'string' ? new DOMParser().parseFromString(view.layoutxml, 'application/xml') : null;
        const columns = Array.from(layout?.getElementsByTagName('cell') ?? [])
          .map((cell) => cell.getAttribute('name') ?? '')
          .filter((name) => name && !name.includes('.') && name !== target.primaryName);
        return { fetchXml: typeof view?.fetchxml === 'string' ? view.fetchxml : null, columns };
      })
      .catch(() => ({ fetchXml: null, columns: [] }));
    lookupViewCache.set(target.logicalName, cached);
  }
  return cached;
}

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';


/**
 * The lookup view's FetchXML limited to the first 15 matches of the text: an OR of "contains"
 * conditions on the searched columns, ANDed with the view's own filters; its sort is kept.
 */
function searchFetchXml(tableLogicalName: string, viewFetchXml: string, columns: readonly string[], searched: readonly string[], text: string): string | null {
  const doc = new DOMParser().parseFromString(viewFetchXml, 'application/xml');
  const fetch = doc.documentElement;
  const entity = fetch?.getElementsByTagName('entity')[0];
  if (!fetch || fetch.tagName !== 'fetch' || !entity || entity.getAttribute('name') !== tableLogicalName) return null;
  fetch.removeAttribute('page');
  fetch.removeAttribute('count');
  fetch.removeAttribute('paging-cookie');
  fetch.setAttribute('top', '15');
  const present = new Set(Array.from(entity.children).filter((child) => child.tagName === 'attribute').map((child) => child.getAttribute('name')));
  for (const name of columns) {
    if (present.has(name)) continue;
    const attribute = doc.createElement('attribute');
    attribute.setAttribute('name', name);
    entity.insertBefore(attribute, entity.firstChild);
  }
  if (text) {
    const filter = doc.createElement('filter');
    filter.setAttribute('type', 'or');
    for (const name of searched) {
      const condition = doc.createElement('condition');
      condition.setAttribute('attribute', name);
      condition.setAttribute('operator', 'like');
      condition.setAttribute('value', `%${text}%`);
      filter.appendChild(condition);
    }
    entity.appendChild(filter);
  }
  return new XMLSerializer().serializeToString(doc);
}

/**
 * Records of the lookup's table matching the text (top 15), like the model-driven lookup: through
 * the table's Lookup View (its filters and sort), searched on the name and the view's text columns.
 * Each result shows the primary name with the view's next two columns under it, as the model-driven
 * lookup does.
 */
export async function searchLookup(target: LookupTable, text: string): Promise<LookupOption[]> {
  const id = `${target.logicalName}id`;
  const query = text.trim();
  const [view] = await Promise.all([lookupView(target), loadLiveColumnMeta(target.logicalName, target.entitySet)]);
  const kindOf = (column: string) => columnMeta(target.logicalName, column)?.kind;
  // As the model-driven lookup: under the name, the lookup view's next two columns, in view order.
  const details = view.columns.filter((column) => kindOf(column) !== undefined).slice(0, 2);
  const texts = view.columns.filter((column) => kindOf(column) === 'text');
  // Searched like the model-driven lookup: the table's Quick Find columns (text ones), else the view's.
  const quickFind = (await loadQuickFindColumns(target)).filter((column) => kindOf(column) === 'text' || kindOf(column) === 'memo');
  const searched = [...new Set([target.primaryName, ...(quickFind.length ? quickFind : texts)])];

  const fetchXml = view.fetchXml ? searchFetchXml(target.logicalName, view.fetchXml, [id, target.primaryName, ...details], searched, query) : null;
  const { rows } = fetchXml
    ? await listRows({ entitySet: target.entitySet, fetchXml })
    : await listRows({
        entitySet: target.entitySet,
        select: [id, target.primaryName, ...details.map((column) => (kindOf(column) === 'lookup' ? `_${column}_value` : column))].join(','),
        filter: query ? searched.map((column) => `contains(${column},'${query.replace(/'/g, "''")}')`).join(' or ') : undefined,
        orderBy: `${target.primaryName} asc`,
        top: 15,
      });

  const shown = (row: DataverseRow, column: string) => {
    const value = row[`${column}${FORMATTED}`] ?? row[column];
    return value === null || value === undefined ? '' : String(value).trim();
  };
  return rows
    .map((row) => {
      const name = shown(row, target.primaryName);
      // Only values with a letter or digit identify a record; a flag such as ❌ / ✔ alone is left out.
      const extra = details.map((column) => shown(row, kindOf(column) === 'lookup' ? `_${column}_value` : column)).filter(Boolean);
      return { id: String(row[id] ?? ''), name: name || '(No name)', detail: extra.join(' · ') || undefined };
    })
    .filter((option) => option.id);
}
