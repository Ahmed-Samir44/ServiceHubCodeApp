import type { Region } from '../../app/region';
import { listRows, type DataverseRow } from '../dataverse';
import { pageFetchXml } from '../views';

/**
 * Shared data helpers for the Andalusia Service Hub pages (the rebuilt legacy web resource).
 * Queries mirror region.html; unlike it, every page of a result set is read (the legacy page
 * stopped at $top=5000 on most tables).
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const PAGE = 5000;
const MAX_PAGES = 40;

/** All rows of a FetchXML query, following FetchXML paging. */
export async function fetchAllRows(entitySet: string, fetchXml: string): Promise<DataverseRow[]> {
  const rows: DataverseRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await listRows({ entitySet, fetchXml: pageFetchXml(fetchXml, page, PAGE).fetchXml });
    rows.push(...result.rows);
    if (!(result.moreRecords ?? result.rows.length === PAGE)) break;
  }
  return rows;
}

/** FetchXML for active rows of a table with the given attributes (and optional extra filter XML). */
export function activeRowsFetch(entity: string, attributes: readonly string[], extraFilter = '', extra = ''): string {
  const attributeXml = attributes.map((name) => `<attribute name="${name}" />`).join('');
  return `<fetch version="1.0" mapping="logical"><entity name="${entity}">${attributeXml}<filter type="and"><condition attribute="statecode" operator="eq" value="0" />${extraFilter}</filter>${extra}</entity></fetch>`;
}

// ---- tolerant field readers ----

export const text = (row: DataverseRow | undefined, name: string): string => {
  const value = row?.[name];
  return value === null || value === undefined ? '' : String(value);
};

export const num = (row: DataverseRow | undefined, name: string): number | null => {
  const value = row?.[name];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
};

/** Lookup id (`_name_value`). */
export const lookupId = (row: DataverseRow | undefined, name: string): string => text(row, `_${name}_value`);

/** Display name of a lookup or choice (server formatted value). */
export const formatted = (row: DataverseRow | undefined, name: string): string =>
  text(row, `${name}${FORMATTED}`) || text(row, `_${name}_value${FORMATTED}`);

const lower = (value: string) => value.toLowerCase();
export const includesText = (haystack: readonly string[], needle: string) => {
  const search = lower(needle.trim());
  return !search || haystack.some((value) => lower(value).includes(search));
};

// ---- cache (same idea as the legacy page's in-memory caches, per region) ----

const cache = new Map<string, Promise<unknown>>();

export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let entry = cache.get(key) as Promise<T> | undefined;
  if (!entry) {
    entry = load();
    cache.set(key, entry);
    entry.catch(() => cache.delete(key));
  }
  return entry;
}

/** Drop cached data (the legacy "Refresh" button). */
export function clearHubCache(prefix = ''): void {
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
}

// ---- business units of a region (legacy loadBUs) ----

export interface BusinessUnit {
  id: string;
  name: string;
}

/** Service Hub business units (application tag 999740008) of the region, like the legacy page. */
export function loadRegionBUs(region: Region): Promise<BusinessUnit[]> {
  return cached(`bu:${region}`, async () => {
    const fetchXml = `<fetch version="1.0" mapping="logical"><entity name="businessunit"><attribute name="businessunitid" /><attribute name="name" /><filter type="and"><condition attribute="isdisabled" operator="eq" value="0" /><condition attribute="cr603_application_tag" operator="contain-values"><value>999740008</value></condition></filter><link-entity name="crd04_regions" from="crd04_regionsid" to="cr603_region" alias="reg"><filter type="and"><condition attribute="crd04_id" operator="eq" value="${region}" /></filter></link-entity></entity></fetch>`;
    const rows = await fetchAllRows('businessunits', fetchXml);
    return rows
      .map((row) => ({ id: text(row, 'businessunitid'), name: text(row, 'name') }))
      .filter((bu) => bu.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

// ---- FetchXML fragments ----

/** Escapes a value for a FetchXML attribute. */
export const xmlValue = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `eq` for one id, `in` for several (empty string for none). */
export function idCondition(attribute: string, ids: readonly string[]): string {
  if (ids.length === 0) return '';
  if (ids.length === 1) return `<condition attribute="${attribute}" operator="eq" value="${xmlValue(ids[0])}" />`;
  return `<condition attribute="${attribute}" operator="in">${ids.map((id) => `<value>${xmlValue(id)}</value>`).join('')}</condition>`;
}

/** "Contains" search across text columns (empty string for no search). */
export function searchCondition(attributes: readonly string[], search: string): string {
  const term = search.trim().replace(/[%_[\]]/g, (char) => `[${char}]`);
  if (!term) return '';
  return `<filter type="or">${attributes.map((name) => `<condition attribute="${name}" operator="like" value="%${xmlValue(term)}%" />`).join('')}</filter>`;
}

/** "Found 3 doctors" */
export const foundText = (count: number, noun: string, plural = `${noun}s`) => `Found ${count} ${count === 1 ? noun : plural}`;
