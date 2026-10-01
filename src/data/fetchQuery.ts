import type { ColumnKind } from './columnMeta';

/**
 * Grid query on top of a view's FetchXML, mirroring the model-driven grid:
 * - "Edit filters": the view's own root filter is parsed into an editable AND/OR tree and written
 *   back (link-entity filters of the view are kept as-is, like the MDA does for related tables).
 * - Column sort ("A to Z" / "Z to A") replaces the view's <order>.
 * - Keyword search adds an OR of "contains" over the grid's text columns.
 */

export interface FilterCondition {
  kind: 'condition';
  id: string;
  attribute: string;
  /** FetchXML operator, e.g. eq, ne, like, null, on-or-after, in, contain-values. */
  operator: string;
  values: string[];
  /** Kept from the view so lookup conditions still show the record name (FetchXML uiname/uitype). */
  uiName?: string;
  uiType?: string;
  /** Record names for several lookup values (FetchXML <value uiname>), same order as values. */
  uiNames?: string[];
}

export interface FilterGroup {
  kind: 'group';
  id: string;
  type: 'and' | 'or';
  items: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

let nextId = 0;
export const newNodeId = () => `n${(nextId += 1)}`;

export const emptyGroup = (type: 'and' | 'or' = 'and'): FilterGroup => ({ kind: 'group', id: newNodeId(), type, items: [] });

function parseXml(xml: string): Document | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.getElementsByTagName('parsererror').length ? null : doc;
}

const rootEntity = (doc: Document) => doc.documentElement.getElementsByTagName('entity')[0] ?? null;
const directChildren = (element: Element, tag: string) => Array.from(element.children).filter((child) => child.tagName === tag);

function parseFilterElement(filter: Element): FilterGroup {
  const group: FilterGroup = { kind: 'group', id: newNodeId(), type: filter.getAttribute('type') === 'or' ? 'or' : 'and', items: [] };
  for (const child of Array.from(filter.children)) {
    if (child.tagName === 'filter') group.items.push(parseFilterElement(child));
    else if (child.tagName === 'condition') {
      const single = child.getAttribute('value');
      const valueElements = Array.from(child.getElementsByTagName('value'));
      const listed = valueElements.map((value) => value.textContent ?? '');
      const listedNames = valueElements.map((value) => value.getAttribute('uiname') ?? '');
      const operator = child.getAttribute('operator') ?? 'eq';
      // "in" / "not-in" over named records is how the MDA saves a multi-record lookup Equals.
      const namedLookup = valueElements.length > 0 && listedNames.every(Boolean);
      group.items.push({
        kind: 'condition',
        id: newNodeId(),
        attribute: (child.getAttribute('entityname') ? `${child.getAttribute('entityname')}.` : '') + (child.getAttribute('attribute') ?? ''),
        operator: namedLookup && operator === 'in' ? 'eq' : namedLookup && operator === 'not-in' ? 'ne' : operator,
        values: single !== null ? [single] : listed,
        uiName: child.getAttribute('uiname') ?? undefined,
        uiType: child.getAttribute('uitype') ?? valueElements[0]?.getAttribute('uitype') ?? undefined,
        uiNames: namedLookup ? listedNames : undefined,
      });
    }
  }
  return group;
}

/** The view's own root-entity filter as an editable tree (several root filters are ANDed). */
export function parseViewFilter(fetchXml: string): FilterGroup {
  const doc = parseXml(fetchXml);
  const entity = doc && rootEntity(doc);
  if (!entity) return emptyGroup();
  const filters = directChildren(entity, 'filter').map(parseFilterElement);
  if (filters.length === 1) return filters[0];
  return { kind: 'group', id: newNodeId(), type: 'and', items: filters };
}

function writeCondition(doc: Document, condition: FilterCondition): Element | null {
  if (!condition.attribute) return null;
  const element = doc.createElement('condition');
  const dot = condition.attribute.indexOf('.');
  if (dot > 0) {
    element.setAttribute('entityname', condition.attribute.slice(0, dot));
    element.setAttribute('attribute', condition.attribute.slice(dot + 1));
  } else element.setAttribute('attribute', condition.attribute);
  const values = condition.values.filter((value) => value !== '');
  // Equals / Does not equal several lookup records is written as in / not-in (as the MDA saves it).
  const severalRecords = (condition.operator === 'eq' || condition.operator === 'ne') && values.length > 1;
  const operator = severalRecords ? (condition.operator === 'eq' ? 'in' : 'not-in') : condition.operator;
  element.setAttribute('operator', operator);
  if (MULTI_VALUE_OPERATORS.has(operator)) {
    values.forEach((value, index) => {
      const valueElement = doc.createElement('value');
      valueElement.textContent = value;
      const name = condition.uiNames?.[index];
      if (name) valueElement.setAttribute('uiname', name);
      if (name && condition.uiType) valueElement.setAttribute('uitype', condition.uiType);
      element.appendChild(valueElement);
    });
    return element;
  }
  if (!NO_VALUE_OPERATORS.has(operator)) {
    if (!values.length) return null; // incomplete row in the editor: ignore it
    element.setAttribute('value', values[0]);
  }
  const uiName = condition.uiName ?? condition.uiNames?.[0];
  if (uiName) element.setAttribute('uiname', uiName);
  if (condition.uiType) element.setAttribute('uitype', condition.uiType);
  return element;
}

function writeGroup(doc: Document, group: FilterGroup): Element | null {
  const element = doc.createElement('filter');
  element.setAttribute('type', group.type);
  for (const item of group.items) {
    const child = item.kind === 'group' ? writeGroup(doc, item) : writeCondition(doc, item);
    if (child) element.appendChild(child);
  }
  return element.children.length ? element : null;
}

export interface GridQuery {
  /** Replacement for the view's root filter; undefined = keep the view's filter. */
  filter?: FilterGroup;
  /** Sort override; undefined = keep the view's sort. */
  sort?: { attribute: string; descending: boolean };
  /** Keyword search: OR of `like` over the table's Quick Find columns (see quickFindPattern). */
  search?: { pattern: string; attributes: string[] };
}

/**
 * Model-driven quick find semantics: "abc" finds values that begin with abc; a leading "*"
 * ("*abc") finds values that contain abc anywhere. LIKE wildcards typed by the user are escaped.
 */
export function quickFindPattern(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const contains = trimmed.startsWith('*');
  const body = (contains ? trimmed.slice(1) : trimmed).replace(/\*+$/, '').replace(/[%_[]/g, '[$&]');
  if (!body) return null;
  return contains ? `%${body}%` : `${body}%`;
}

export function applyGridQuery(fetchXml: string, query: GridQuery): string {
  if (!query.filter && !query.sort && !query.search) return fetchXml;
  const doc = parseXml(fetchXml);
  const entity = doc && rootEntity(doc);
  if (!doc || !entity) return fetchXml;

  if (query.filter) {
    directChildren(entity, 'filter').forEach((filter) => entity.removeChild(filter));
    const filter = writeGroup(doc, query.filter);
    if (filter) entity.appendChild(filter);
  }

  if (query.search?.attributes.length) {
    const search = doc.createElement('filter');
    search.setAttribute('type', 'or');
    for (const attribute of query.search.attributes) {
      const condition = doc.createElement('condition');
      condition.setAttribute('attribute', attribute);
      condition.setAttribute('operator', 'like');
      condition.setAttribute('value', query.search.pattern);
      search.appendChild(condition);
    }
    entity.appendChild(search);
  }

  if (query.sort) {
    // One sort at a time: drop the view's orders, on the table and on its links.
    directChildren(entity, 'order').forEach((order) => entity.removeChild(order));
    Array.from(entity.getElementsByTagName('link-entity')).forEach((link) => directChildren(link, 'order').forEach((order) => link.removeChild(order)));
    // A linked-table column (`alias.attribute`) is sorted inside its link-entity.
    const dot = query.sort.attribute.indexOf('.');
    const link = dot > 0 ? Array.from(entity.getElementsByTagName('link-entity')).find((item) => item.getAttribute('alias') === query.sort?.attribute.slice(0, dot)) : undefined;
    const order = doc.createElement('order');
    order.setAttribute('attribute', link ? query.sort.attribute.slice(dot + 1) : query.sort.attribute);
    order.setAttribute('descending', query.sort.descending ? 'true' : 'false');
    (link ?? entity).appendChild(order);
  }
  return new XMLSerializer().serializeToString(doc);
}

/** Current sort of a view's FetchXML (first root <order>), for the column header arrow. */
export function viewSort(fetchXml: string): { attribute: string; descending: boolean } | null {
  const doc = parseXml(fetchXml);
  const entity = doc && rootEntity(doc);
  const order = entity ? directChildren(entity, 'order')[0] : undefined;
  const attribute = order?.getAttribute('attribute');
  if (attribute) return { attribute, descending: order?.getAttribute('descending') === 'true' };
  // A sort on a linked-table column sits inside its link-entity (`alias.attribute`).
  for (const link of entity ? Array.from(entity.getElementsByTagName('link-entity')) : []) {
    const linkOrder = directChildren(link, 'order')[0];
    const linkAttribute = linkOrder?.getAttribute('attribute');
    const alias = link.getAttribute('alias');
    if (linkAttribute && alias) return { attribute: `${alias}.${linkAttribute}`, descending: linkOrder?.getAttribute('descending') === 'true' };
  }
  return null;
}

// ---- Operators offered in the filter editor (labels as in the model-driven "Edit filters") ----

export const NO_VALUE_OPERATORS = new Set([
  'null', 'not-null', 'today', 'yesterday', 'tomorrow', 'this-week', 'last-week', 'next-week',
  'this-month', 'last-month', 'next-month', 'this-year', 'last-year', 'next-year', 'eq-userid', 'ne-userid',
]);

export const MULTI_VALUE_OPERATORS = new Set(['in', 'not-in', 'contain-values', 'not-contain-values']);

export interface OperatorOption {
  value: string;
  label: string;
}

const TEXT_OPERATORS: OperatorOption[] = [
  { value: 'eq', label: 'Equals' },
  { value: 'ne', label: 'Does not equal' },
  { value: 'like', label: 'Contains' },
  { value: 'not-like', label: 'Does not contain' },
  { value: 'begins-with', label: 'Begins with' },
  { value: 'not-begin-with', label: 'Does not begin with' },
  { value: 'ends-with', label: 'Ends with' },
  { value: 'not-end-with', label: 'Does not end with' },
  { value: 'not-null', label: 'Contains data' },
  { value: 'null', label: 'Does not contain data' },
];

const NUMBER_OPERATORS: OperatorOption[] = [
  { value: 'eq', label: 'Equals' },
  { value: 'ne', label: 'Does not equal' },
  { value: 'gt', label: 'Is greater than' },
  { value: 'ge', label: 'Is greater than or equal to' },
  { value: 'lt', label: 'Is less than' },
  { value: 'le', label: 'Is less than or equal to' },
  { value: 'not-null', label: 'Contains data' },
  { value: 'null', label: 'Does not contain data' },
];

const DATE_OPERATORS: OperatorOption[] = [
  { value: 'on', label: 'On' },
  { value: 'on-or-after', label: 'On or after' },
  { value: 'on-or-before', label: 'On or before' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This week' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'this-year', label: 'This year' },
  { value: 'last-x-days', label: 'Last X days' },
  { value: 'next-x-days', label: 'Next X days' },
  { value: 'not-null', label: 'Contains data' },
  { value: 'null', label: 'Does not contain data' },
];

const CHOICE_OPERATORS: OperatorOption[] = [
  { value: 'eq', label: 'Equals' },
  { value: 'ne', label: 'Does not equal' },
  { value: 'in', label: 'Equals any of' },
  { value: 'not-in', label: 'Does not equal any of' },
  { value: 'not-null', label: 'Contains data' },
  { value: 'null', label: 'Does not contain data' },
];

const MULTI_CHOICE_OPERATORS: OperatorOption[] = [
  { value: 'contain-values', label: 'Contains values' },
  { value: 'not-contain-values', label: 'Does not contain values' },
  { value: 'not-null', label: 'Contains data' },
  { value: 'null', label: 'Does not contain data' },
];

// "Contains" on a lookup matches the referenced record's name (e.g. "BU contains AHJ").
const LOOKUP_OPERATORS: OperatorOption[] = [
  { value: 'eq', label: 'Equals' },
  { value: 'ne', label: 'Does not equal' },
  { value: 'like', label: 'Contains' },
  { value: 'not-like', label: 'Does not contain' },
  { value: 'not-null', label: 'Contains data' },
  { value: 'null', label: 'Does not contain data' },
];

export function operatorsFor(kind: ColumnKind, multiSelect: boolean): OperatorOption[] {
  if (kind === 'choice') return multiSelect ? MULTI_CHOICE_OPERATORS : CHOICE_OPERATORS;
  if (kind === 'number') return NUMBER_OPERATORS;
  if (kind === 'date') return DATE_OPERATORS;
  if (kind === 'lookup') return LOOKUP_OPERATORS;
  return TEXT_OPERATORS;
}

/** "Contains" is stored as like %value%; the editor shows the value without wildcards. */
export const displayValue = (operator: string, value: string) =>
  operator === 'like' || operator === 'not-like' ? value.replace(/^%|%$/g, '') : value;

export const storedValue = (operator: string, value: string) =>
  (operator === 'like' || operator === 'not-like') && value && !value.includes('%') ? `%${value}%` : value;

/** Attributes used anywhere in a filter tree. */
export function filterAttributes(group: FilterGroup | undefined): Set<string> {
  const names = new Set<string>();
  const walk = (node: FilterNode) => {
    if (node.kind === 'condition') names.add(node.attribute);
    else node.items.forEach(walk);
  };
  if (group) walk(group);
  return names;
}

/** The tree without any condition on `attribute` (groups left empty are dropped). */
export function removeAttribute(group: FilterGroup, attribute: string): FilterGroup {
  const items: FilterNode[] = [];
  for (const item of group.items) {
    if (item.kind === 'condition') {
      if (item.attribute !== attribute) items.push(item);
    } else {
      const inner = removeAttribute(item, attribute);
      if (inner.items.length) items.push(inner);
    }
  }
  return { ...group, items };
}
