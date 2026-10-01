import type { TableRef } from '../app/navigation';
import type { Region } from '../app/region';
import { columnMeta, loadLiveColumnMeta, tableAttributes, type ColumnKind } from './columnMeta';
import { listRows, type DataverseRow } from './dataverse';
import { MDA_APP_ID } from './config';

/**
 * System views (savedquery) are the source of truth for each table's grid: the view's layoutxml
 * gives the columns (order + width) and its fetchxml gives the filters and sort — exactly what
 * the model-driven app shows. Nothing about columns or filters is hard-coded here.
 */

export interface GridColumn {
  /** Attribute name as in the layout; `alias.attribute` for linked-entity columns. */
  name: string;
  label: string;
  kind: ColumnKind;
  width: number;
  /** Column comes from a linked table (`alias.attribute`); sorted and filtered through that link. */
  linked: boolean;
  /** Logical name of the linked table, for a linked column (its metadata: kind, choice options). */
  entity?: string;
}

export interface TableView {
  id: string;
  name: string;
  isDefault: boolean;
  /** Personal view (userquery, "My Views") rather than a system view (savedquery). */
  personal: boolean;
  /** Region this view is meant for, from its name (EGY / KSA), or null for shared views. */
  region: Region | null;
  fetchXml: string;
  layoutXml: string;
  columns: GridColumn[];
}

const DEFAULT_COLUMN_WIDTH = 150;

/** EGY / KSA marker in a view name, e.g. "Active Doctors - EGY" or "KSA Offers". */
export function regionOfViewName(name: string): Region | null {
  if (/(^|[^a-z])(egy|egypt)([^a-z]|$)/i.test(name)) return 'EGY';
  if (/(^|[^a-z])(ksa|saudi)([^a-z]|$)/i.test(name)) return 'KSA';
  return null;
}

const humanize = (attribute: string) =>
  attribute.replace(/^[a-z0-9]+_/, '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function parseXml(xml: string): Document | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.getElementsByTagName('parsererror').length ? null : doc;
}

interface LinkedTable {
  /** Linked table logical name. */
  entity: string;
  /** Lookup on the base table the link goes through (the link-entity `to`). */
  via: string | null;
}

/** alias -> linked table, so linked columns get their real labels. */
function linkAliases(fetchDoc: Document | null): Map<string, LinkedTable> {
  const aliases = new Map<string, LinkedTable>();
  if (!fetchDoc) return aliases;
  for (const link of Array.from(fetchDoc.getElementsByTagName('link-entity'))) {
    const alias = link.getAttribute('alias');
    const entity = link.getAttribute('name');
    if (alias && entity) aliases.set(alias, { entity, via: link.getAttribute('to') });
  }
  return aliases;
}

function columnFor(name: string, width: number, tableLogicalName: string, aliases: Map<string, LinkedTable>): GridColumn {
  const dot = name.indexOf('.');
  const linked = dot > 0 ? aliases.get(name.slice(0, dot)) : undefined;
  const attribute = dot > 0 ? name.slice(dot + 1) : name;
  const owner = dot > 0 ? linked?.entity : tableLogicalName;
  const known = owner ? columnMeta(owner, attribute) : undefined;
  let label = known?.label ?? humanize(attribute);
  // Same convention as the model-driven grid: "Arabic Name (Specialty)" for a linked-table column.
  if (linked) {
    const viaLabel = linked.via ? columnMeta(tableLogicalName, linked.via)?.label : undefined;
    label = `${label} (${viaLabel ?? humanize(linked.entity)})`;
  }
  return {
    name,
    label,
    kind: known?.kind ?? 'text',
    width: width > 0 ? width : DEFAULT_COLUMN_WIDTH,
    linked: dot > 0,
    entity: dot > 0 ? linked?.entity : undefined,
  };
}

/** Grid column for an attribute of the table itself (used for columns the user adds). */
export function tableColumn(name: string, tableLogicalName: string): GridColumn {
  return columnFor(name, DEFAULT_COLUMN_WIDTH, tableLogicalName, new Map());
}

// Technical attributes the model-driven "Edit columns" panel does not offer either.
const HIDDEN_ATTRIBUTES = new Set([
  'versionnumber',
  'importsequencenumber',
  'overriddencreatedon',
  'timezoneruleversionnumber',
  'utcconversiontimezonecode',
  'owningteam',
  'owninguser',
  'owningbusinessunit',
]);

/** Every attribute of the table that can be shown as a column, sorted by label. */
export function availableColumns(tableLogicalName: string): GridColumn[] {
  const attributes = tableAttributes(tableLogicalName);
  return attributes
    .filter((name) => !HIDDEN_ATTRIBUTES.has(name) && name !== `${tableLogicalName}id` && !name.endsWith('_base'))
    .map((name) => tableColumn(name, tableLogicalName))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Makes sure the view's FetchXML returns the given base-table attributes, so user-added columns
 * have data. Filters, sort and links of the view are left untouched.
 */
export function withAttributes(fetchXml: string, names: readonly string[]): string {
  const doc = parseXml(fetchXml);
  const entity = doc?.documentElement.getElementsByTagName('entity')[0];
  if (!doc || !entity) return fetchXml;
  const direct = Array.from(entity.children);
  if (direct.some((child) => child.tagName === 'all-attributes')) return fetchXml;
  const present = new Set(direct.filter((child) => child.tagName === 'attribute').map((child) => child.getAttribute('name')));
  let changed = false;
  for (const name of names) {
    if (name.includes('.') || present.has(name)) continue;
    const attribute = doc.createElement('attribute');
    attribute.setAttribute('name', name);
    entity.insertBefore(attribute, entity.firstChild);
    present.add(name);
    changed = true;
  }
  return changed ? new XMLSerializer().serializeToString(doc) : fetchXml;
}

export function parseViewColumns(layoutXml: string, fetchXml: string, tableLogicalName: string): GridColumn[] {
  const layout = parseXml(layoutXml);
  if (!layout) return [];
  const aliases = linkAliases(parseXml(fetchXml));
  return Array.from(layout.getElementsByTagName('cell'))
    .filter((cell) => cell.getAttribute('ishidden') !== '1' && cell.getAttribute('name'))
    .map((cell) => columnFor(cell.getAttribute('name') ?? '', Number(cell.getAttribute('width')), tableLogicalName, aliases));
}

// Views change rarely; cache per table for the session so switching screens is instant.
const viewCache = new Map<string, Promise<TableView[]>>();

function toView(row: DataverseRow, idField: 'savedqueryid' | 'userqueryid', tableLogicalName: string): TableView | null {
  if (typeof row.fetchxml !== 'string' || typeof row.layoutxml !== 'string') return null;
  const name = String(row.name ?? 'View');
  return {
    id: String(row[idField]),
    name,
    isDefault: row.isdefault === true,
    personal: idField === 'userqueryid',
    region: regionOfViewName(name),
    fetchXml: row.fetchxml,
    layoutXml: row.layoutxml,
    columns: parseViewColumns(row.layoutxml, row.fetchxml, tableLogicalName),
  };
}

const VIEW_SELECT = 'name,isdefault,fetchxml,layoutxml';

/**
 * System views the model-driven app includes (app designer), as savedquery ids; null when the app
 * can't be read. When the app lists no view of a table, the model-driven app shows all of them.
 */
let appViews: Promise<Set<string> | null> | null = null;
function loadAppViewIds(): Promise<Set<string> | null> {
  appViews ??= listRows({
    entitySet: 'appmodulecomponents',
    fetchXml: `<fetch><entity name="appmodulecomponent"><attribute name="objectid" /><filter><condition attribute="componenttype" operator="eq" value="26" /></filter><link-entity name="appmodule" from="appmoduleidunique" to="appmoduleidunique"><filter><condition attribute="appmoduleid" operator="eq" value="${MDA_APP_ID}" /></filter></link-entity></entity></fetch>`,
  })
    .then(({ rows }) => new Set(rows.map((row) => String(row.objectid ?? '').toLowerCase()).filter(Boolean)))
    .catch(() => null);
  return appViews;
}
const viewFilter = (tableLogicalName: string) => `returnedtypecode eq '${tableLogicalName}' and querytype eq 0 and statecode eq 0`;

/**
 * System views (savedquery) plus the user's own and shared personal views ("My Views", userquery).
 * Dataverse only returns personal views the user owns or that were shared with them.
 */
export function loadViews(table: TableRef, { refresh = false } = {}): Promise<TableView[]> {
  const cached = viewCache.get(table.logicalName);
  if (cached && !refresh) return cached;
  const system = listRows({ entitySet: 'savedqueries', select: `savedqueryid,${VIEW_SELECT}`, filter: viewFilter(table.logicalName), orderBy: 'name asc' });
  // Columns are built from the table's metadata: read it live first (new columns), see columnMeta.ts.
  const meta = loadLiveColumnMeta(table.logicalName, table.entitySet);
  // Personal views are optional: a failure here must not hide the system views.
  const personal = listRows({ entitySet: 'userqueries', select: `userqueryid,${VIEW_SELECT}`, filter: viewFilter(table.logicalName), orderBy: 'name asc' }).catch(() => null);
  const request = Promise.all([system, personal, loadAppViewIds(), meta]).then(([systemResult, personalResult, inApp]) => {
    // Like the model-driven app: only the system views the app includes, unless it lists none of this table's.
    const idOf = (row: DataverseRow) => String(row.savedqueryid ?? '').toLowerCase();
    const limit = inApp && systemResult.rows.some((row) => inApp.has(idOf(row))) ? inApp : null;
    const systemRows = limit ? systemResult.rows.filter((row) => limit.has(idOf(row))) : systemResult.rows;
    return [
      ...(personalResult?.rows ?? []).map((row) => toView(row, 'userqueryid', table.logicalName)),
      ...systemRows.map((row) => toView(row, 'savedqueryid', table.logicalName)),
    ].filter((view): view is TableView => view !== null);
  });
  viewCache.set(table.logicalName, request);
  request.catch(() => viewCache.delete(table.logicalName));
  return request;
}

/** One system view by id (used by form subgrids); null when it isn't available. */
export async function loadViewById(table: TableRef, viewId: string): Promise<TableView | null> {
  const { rows } = await listRows({ entitySet: 'savedqueries', select: `savedqueryid,${VIEW_SELECT}`, filter: `savedqueryid eq ${viewId}`, top: 1 });
  return rows[0] ? toView(rows[0], 'savedqueryid', table.logicalName) : null;
}

/** Adds `attribute eq value` to the view's root entity (ANDed with the view's own filters). */
export function withCondition(fetchXml: string, attribute: string, value: string): string {
  const doc = parseXml(fetchXml);
  const entity = doc?.documentElement.getElementsByTagName('entity')[0];
  if (!doc || !entity) return fetchXml;
  const filter = doc.createElement('filter');
  filter.setAttribute('type', 'and');
  const condition = doc.createElement('condition');
  condition.setAttribute('attribute', attribute);
  condition.setAttribute('operator', 'eq');
  condition.setAttribute('value', value);
  filter.appendChild(condition);
  entity.appendChild(filter);
  return new XMLSerializer().serializeToString(doc);
}

/** layoutxml for the given columns, keeping the original view's grid/row attributes. */
export function buildLayoutXml(baseLayoutXml: string, tableLogicalName: string, primaryName: string, columns: readonly GridColumn[]): string {
  const doc = parseXml(baseLayoutXml);
  const row = doc?.getElementsByTagName('row')[0];
  if (!doc || !row) {
    const cells = columns.map((column) => `<cell name="${column.name}" width="${column.width}" />`).join('');
    return `<grid name="resultset" jump="${primaryName}" select="1" icon="1" preview="1"><row name="result" id="${tableLogicalName}id">${cells}</row></grid>`;
  }
  Array.from(row.getElementsByTagName('cell')).forEach((cell) => row.removeChild(cell));
  for (const column of columns) {
    const cell = doc.createElement('cell');
    cell.setAttribute('name', column.name);
    cell.setAttribute('width', String(Math.round(column.width)));
    row.appendChild(cell);
  }
  return new XMLSerializer().serializeToString(doc);
}

const quickFindCache = new Map<string, Promise<string[]>>();

/**
 * "Find columns" of the table's Quick Find view (savedquery querytype 4): the conditions inside its
 * <filter isquickfindfields="1">. These are exactly the columns the model-driven search box uses.
 * Empty when the table has no Quick Find view or it can't be read.
 */
export function loadQuickFindColumns(table: TableRef): Promise<string[]> {
  let cached = quickFindCache.get(table.logicalName);
  if (!cached) {
    cached = listRows({
      entitySet: 'savedqueries',
      select: 'savedqueryid,fetchxml,isdefault',
      filter: `returnedtypecode eq '${table.logicalName}' and querytype eq 4 and statecode eq 0`,
    })
      .then(({ rows }) => {
        const view = rows.find((row) => row.isdefault === true) ?? rows[0];
        const doc = typeof view?.fetchxml === 'string' ? parseXml(view.fetchxml) : null;
        if (!doc) return [];
        const findFilter = Array.from(doc.getElementsByTagName('filter')).find((filter) => filter.getAttribute('isquickfindfields') === '1');
        if (!findFilter) return [];
        return Array.from(findFilter.getElementsByTagName('condition'))
          // Only text-style find columns; linked-table conditions (entityname) are left to the model-driven app.
          .filter((condition) => condition.getAttribute('operator') === 'like' && !condition.getAttribute('entityname'))
          .map((condition) => condition.getAttribute('attribute') ?? '')
          .filter(Boolean);
      })
      .catch(() => []);
    quickFindCache.set(table.logicalName, cached);
  }
  return cached;
}

/** Region view first (e.g. "… EGY" when Egypt is selected), then the table's default view, then the first. */
export function pickView(views: readonly TableView[], region: Region | null, userDefaultId?: string | null): TableView | undefined {
  const system = views.filter((view) => !view.personal);
  return (
    (userDefaultId ? views.find((view) => view.id === userDefaultId) : undefined) ??
    (region ? system.find((view) => view.region === region) : undefined) ??
    system.find((view) => view.isDefault) ??
    system[0] ??
    views[0]
  );
}

// "Set as default view" is kept per table in this browser (the model-driven app keeps it per user).
const defaultViewKey = (tableLogicalName: string) => `servicehub.defaultview.${tableLogicalName}`;

export function readDefaultView(tableLogicalName: string): string | null {
  try {
    return window.localStorage.getItem(defaultViewKey(tableLogicalName));
  } catch {
    return null;
  }
}

export function writeDefaultView(tableLogicalName: string, viewId: string | null): void {
  try {
    if (viewId) window.localStorage.setItem(defaultViewKey(tableLogicalName), viewId);
    else window.localStorage.removeItem(defaultViewKey(tableLogicalName));
  } catch {
    // Not persisted when storage is blocked.
  }
}

export interface PagedFetch {
  fetchXml: string;
  /** False when the view uses `top` (Dataverse does not allow top together with paging). */
  pageable: boolean;
}

/** Adds page/count/returntotalrecordcount to the view's own FetchXML, keeping its filters and sort. */
export function pageFetchXml(fetchXml: string, page: number, pageSize: number): PagedFetch {
  const doc = parseXml(fetchXml);
  const fetch = doc?.documentElement;
  if (!doc || !fetch || fetch.tagName !== 'fetch') return { fetchXml, pageable: false };
  if (fetch.hasAttribute('top')) return { fetchXml, pageable: false };
  fetch.setAttribute('page', String(page));
  fetch.setAttribute('count', String(pageSize));
  fetch.setAttribute('returntotalrecordcount', 'true');
  fetch.removeAttribute('paging-cookie');
  return { fetchXml: new XMLSerializer().serializeToString(doc), pageable: true };
}
