import DOMPurify from 'dompurify';
import type { ColumnKind } from './columnMeta';
import type { DataverseRow } from './dataverse';

/** What the formatter needs to know about a column/field (grid columns and form fields both fit). */
export interface ValueColumn {
  name: string;
  kind: ColumnKind;
}

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const LOOKUP_TABLE = '@Microsoft.Dynamics.CRM.lookuplogicalname';
const MAX_CELL_LENGTH = 160;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });

const looksLikeHtml = (text: string) => /<[a-z][\s\S]*>/i.test(text);

/** Rich-text (HTML) values flattened to one line of plain text for the grid. */
const stripHtml = (text: string) =>
  text.includes('<') || text.includes('&')
    ? decodeEntities(text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    : text;

const URL_PATTERN = /^(https?:\/\/|www\.)\S+$/i;

/**
 * Link target when the value is a plain URL (Iframe URL, System Link …).
 * Dataverse schemas here do not mark URL columns, so this is decided by the value itself.
 */
export function cellLink(row: DataverseRow, column: ValueColumn): string | null {
  if (column.kind !== 'text' && column.kind !== 'memo') return null;
  const raw = row[column.name];
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!URL_PATTERN.test(value)) return null;
  return value.toLowerCase().startsWith('www.') ? `https://${value}` : value;
}

export interface LookupTarget {
  /** Logical name of the referenced table. */
  table: string;
  id: string;
}

/** Referenced record of a lookup column (base-table lookups only; linked-entity columns have no target). */
export function lookupTarget(row: DataverseRow, column: ValueColumn): LookupTarget | null {
  if (column.kind !== 'lookup' || column.name.includes('.')) return null;
  const key = `_${column.name}_value`;
  const id = row[key];
  const table = row[`${key}${LOOKUP_TABLE}`];
  return typeof id === 'string' && typeof table === 'string' ? { table, id } : null;
}

/**
 * Display text for one value. Prefers the server's formatted value (lookup names, choice labels,
 * localized dates and numbers), which the connector returns because we request annotations.
 * Rich text is flattened to plain text; `truncate` shortens it for grid cells.
 */
export function formatCell(row: DataverseRow, column: ValueColumn, { truncate = true } = {}): string {
  const lookupKey = `_${column.name}_value`;
  const formatted = row[`${column.name}${FORMATTED}`] ?? row[`${lookupKey}${FORMATTED}`];
  const raw = formatted ?? row[column.name] ?? row[lookupKey];
  if (raw === null || raw === undefined || raw === '') return '';

  let text: string;
  if (typeof raw === 'boolean') text = raw ? 'Yes' : 'No';
  else if (column.kind === 'date' && formatted === undefined && typeof raw === 'string') {
    const date = new Date(raw);
    text = Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString();
  } else text = String(raw);

  text = stripHtml(text);
  return truncate && text.length > MAX_CELL_LENGTH ? `${text.slice(0, MAX_CELL_LENGTH - 1)}…` : text;
}

/** Rich text HTML with scripts, event handlers and unsafe URLs removed (DOMPurify). */
export const sanitizeRichText = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

/**
 * Sanitized HTML for rich-text (CKEditor) values, or null when the value is plain text.
 * Scripts, event handlers and unsafe URLs are removed by DOMPurify before rendering.
 */
export function richTextHtml(row: DataverseRow, column: ValueColumn): string | null {
  if (column.kind !== 'memo' && column.kind !== 'text') return null;
  const raw = row[column.name];
  if (typeof raw !== 'string' || !looksLikeHtml(raw)) return null;
  return sanitizeRichText(raw);
}
