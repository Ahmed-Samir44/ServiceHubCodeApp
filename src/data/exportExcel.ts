import type { DataverseRow } from './dataverse';
import { formatCell } from './formatCell';
import type { GridColumn } from './views';

/**
 * "Export to Excel" → Static Worksheet, like the model-driven export: the grid's columns (labels,
 * order) with typed cells — numbers stay numbers, dates stay dates (so Excel can sum / sort /
 * filter them), choices and lookups show their names, and rich text (HTML) becomes readable text
 * with its paragraphs, line breaks and bullets kept (wrapped in the cell).
 * The 'universal' build is used because it needs no Web Workers, which the Power Apps host may block.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const EXCEL_CELL_LIMIT = 32767;

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });

/** Rich text (HTML) → plain text keeping structure: one line per paragraph / line break, "• " bullets. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol|blockquote)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n')
    .trim();
}

const looksLikeHtml = (text: string) => /<[a-z][\s\S]*>/i.test(text);

type Cell = { value: string | number | Date | undefined; type?: StringConstructor | NumberConstructor | DateConstructor; format?: string; wrap?: boolean };

function cellFor(row: DataverseRow, column: GridColumn): Cell | null {
  const raw = row[column.name];
  // Numbers: the raw value (formatted value is text like "1,200.00").
  if (column.kind === 'number' && typeof raw === 'number') return { value: raw, type: Number };
  // Dates: a real Excel date; date-only values (midnight) without the time part.
  if (column.kind === 'date' && typeof raw === 'string' && raw) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw) || (date.getHours() === 0 && date.getMinutes() === 0);
      return { value: date, type: Date, format: dateOnly ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm' };
    }
  }
  // Rich text: structured plain text, wrapped.
  if (typeof raw === 'string' && row[`${column.name}${FORMATTED}`] === undefined && looksLikeHtml(raw)) {
    const text = htmlToText(raw).slice(0, EXCEL_CELL_LIMIT);
    return text ? { value: text, type: String, wrap: text.includes('\n') } : null;
  }
  // Everything else (choices, lookups, yes/no, text): the displayed value.
  const text = formatCell(row, column, { truncate: false }).slice(0, EXCEL_CELL_LIMIT);
  if (!text) return null;
  const multiline = typeof raw === 'string' && raw.includes('\n');
  return { value: multiline ? raw.slice(0, EXCEL_CELL_LIMIT) : text, type: String, wrap: multiline };
}

export async function exportToExcel(fileName: string, columns: readonly GridColumn[], rows: readonly DataverseRow[]): Promise<void> {
  const header = columns.map((column) => ({ value: column.label, fontWeight: 'bold' as const }));
  const body = rows.map((row) => columns.map((column) => cellFor(row, column)));
  // Loaded only when exporting, to keep it out of the app's first download.
  const { default: writeXlsxFile } = await import('write-excel-file/universal');
  const blob = await writeXlsxFile([header, ...body], {
    sheet: 'Data',
    columns: columns.map((column) => ({ width: Math.max(10, Math.round(column.width / 7)) })),
    stickyRowsCount: 1,
  }).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Export'}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
