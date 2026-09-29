import { useEffect, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import { errorMessage } from '../../data/dataverse';
import { isProtectedOfficeFile, readSharePointFile, readSharePointFileAsPdf, type SharePointFileRef } from '../../data/sharepointFiles';
import { useAsyncData } from '../../data/useAsyncData';
import { HubEmpty, HubError, HubLoading } from './HubCommon';

type Loaded = { kind: 'sheets'; sheets: { name: string; rows: string[][] }[] } | { kind: 'blob'; url: string; pdf: boolean; note?: string };

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
};

async function load(file: SharePointFileRef): Promise<Loaded> {
  const blob = await readSharePointFile(file);
  if (file.extension === 'xlsx' || file.extension === 'xlsm') {
    // Protected (encrypted / labelled) workbooks can't be parsed here: show SharePoint's PDF rendering.
    if (await isProtectedOfficeFile(blob)) {
      const pdf = await readSharePointFileAsPdf(file);
      return { kind: 'blob', url: URL.createObjectURL(pdf), pdf: true, note: 'Protected file — shown as a read-only PDF snapshot of the latest version.' };
    }
    try {
      const sheets = await readXlsxFile(blob);
      return { kind: 'sheets', sheets: sheets.map((sheet) => ({ name: sheet.sheet, rows: sheet.data.map((row) => row.map(cellText)) })) };
    } catch (error) {
      throw new Error(`Couldn’t read the Excel file: ${errorMessage(error)}`);
    }
  }
  // Object URL made here (not in an effect); revoked when the component drops it.
  return { kind: 'blob', url: URL.createObjectURL(blob), pdf: file.extension === 'pdf' };
}

/**
 * Shows a SharePoint file inside the page: fetched through the SharePoint connector (latest version
 * every time; "Refresh" re-reads it). Excel → one tab per sheet as a table; PDF / images → in-page.
 */
export function SharePointFileViewer({ file }: { file: SharePointFileRef }) {
  const [reload, setReload] = useState(0);
  const [sheetIndex, setSheetIndex] = useState(0);
  const data = useAsyncData(`${file.site}|${file.id ?? file.serverPath}|${reload}`, () => load(file));

  const objectUrl = data.data?.kind === 'blob' ? data.data.url : null;
  useEffect(() => (objectUrl ? () => URL.revokeObjectURL(objectUrl) : undefined), [objectUrl]);

  const refresh = (
    <button type="button" className="btn btn-outline btn-sm" onClick={() => setReload((count) => count + 1)} disabled={data.loading}>
      {data.loading ? 'Loading…' : 'Refresh'}
    </button>
  );

  if (data.loading) return <HubLoading label="Loading the latest version from SharePoint…" />;
  if (data.error || !data.data) return <HubError title="Couldn’t open the file here" message={`${data.error ?? ''} — use “Open in new tab”.`} onRetry={() => setReload((count) => count + 1)} />;

  if (data.data.kind === 'blob') {
    const isImage = !data.data.pdf;
    return (
      <div className="spf">
        <div className="spf-bar">
          <span className="hub-muted">{data.data.note ?? ''}</span>
          {refresh}
        </div>
        {isImage ? <img className="spf-image" src={data.data.url} alt={file.name} /> : <iframe className="hub-frame" src={data.data.url} title={file.name} />}
      </div>
    );
  }

  const { sheets } = data.data;
  if (!sheets.length) return <HubEmpty title="Empty workbook" sub="This file has no sheets." />;
  const active = sheets[Math.min(sheetIndex, sheets.length - 1)];
  const width = Math.max(0, ...active.rows.map((row) => row.length));
  // Trim fully empty trailing rows.
  let last = active.rows.length;
  while (last > 0 && active.rows[last - 1].every((cell) => cell === '')) last -= 1;
  const rows = active.rows.slice(0, last);

  return (
    <div className="spf">
      <div className="spf-bar">
        {sheets.length > 1 ? (
          <div className="seg-group spf-tabs" role="tablist" aria-label="Sheets">
            {sheets.map((sheet, index) => (
              <button key={sheet.name} type="button" role="tab" aria-selected={sheet === active} className={`seg-btn${sheet === active ? ' active' : ''}`} onClick={() => setSheetIndex(index)}>
                {sheet.name}
              </button>
            ))}
          </div>
        ) : (
          <span className="spf-sheet-name">{active.name}</span>
        )}
        {refresh}
      </div>
      {rows.length === 0 ? (
        <HubEmpty title="Empty sheet" sub="This sheet has no data." />
      ) : (
        <div className="spf-table-wrap">
          <table className="spf-table">
            <thead>
              <tr>
                {Array.from({ length: width }, (_, index) => (
                  <th key={index} dir="auto">{rows[0][index] ?? ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {Array.from({ length: width }, (_, index) => (
                    <td key={index} dir="auto">{row[index] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
