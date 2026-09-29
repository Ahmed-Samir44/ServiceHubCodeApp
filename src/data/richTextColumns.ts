import { listRows } from './dataverse';

/**
 * Multi-line text columns whose column format is "Rich text" (MemoAttributeMetadata.FormatName =
 * RichText). The model-driven form shows the rich text editor for these even when the form XML
 * doesn't bind the RichTextEditorControl, so the form alone isn't enough to recognise them.
 * The saved schemas don't carry the format, so it is read from table metadata at runtime.
 * Resolves to an empty set when metadata can't be read (form XML / HTML detection still apply).
 */

const cache = new Map<string, Promise<Set<string>>>();

export function loadRichTextColumns(tableLogicalName: string): Promise<Set<string>> {
  let cached = cache.get(tableLogicalName);
  if (!cached) {
    cached = listRows({
      entitySet: `EntityDefinitions(LogicalName='${tableLogicalName}')/Attributes/Microsoft.Dynamics.CRM.MemoAttributeMetadata`,
      select: 'LogicalName,FormatName',
    })
      .then(({ rows }) => {
        const names = rows
          .filter((row) => {
            const format = row.FormatName as { Value?: unknown } | string | undefined;
            const value = typeof format === 'string' ? format : format?.Value;
            return typeof value === 'string' && value.toLowerCase() === 'richtext';
          })
          .map((row) => String(row.LogicalName ?? ''))
          .filter(Boolean);
        if (import.meta.env.DEV) console.info(`[dataverse] rich text columns of ${tableLogicalName}:`, names);
        return new Set(names);
      })
      .catch((error: unknown) => {
        if (import.meta.env.DEV) console.warn(`[dataverse] couldn't read column formats of ${tableLogicalName}`, error);
        return new Set<string>();
      });
    cache.set(tableLogicalName, cached);
  }
  return cached;
}
