import { findTable } from '../../app/navigation';
import { onFileLinkClick } from '../../data/fileLinks';
import { cellLink, formatCell } from '../../data/formatCell';
import type { FormSubgrid } from '../../data/forms';
import { loadSubgrid } from '../../data/related';
import { useAsyncData } from '../../data/useAsyncData';
import type { FormTarget } from '../RecordForm';

interface SubgridViewProps {
  subgrid: FormSubgrid;
  parentTable: string;
  parentId: string;
  /** Changes when the parent record is refreshed/saved, to reload the related rows. */
  reloadKey: number;
  onOpen: (target: FormTarget) => void;
}

const linkStyle = { color: 'var(--gold-dark)', textDecoration: 'underline' } as const;

/** Related records on the form (the model-driven subgrid), first 10 rows; click a row to open it. */
export function SubgridView({ subgrid, parentTable, parentId, reloadKey, onOpen }: SubgridViewProps) {
  const data = useAsyncData(`${subgrid.id}#${parentId}#${reloadKey}`, () => loadSubgrid(subgrid, parentTable, parentId));
  const opensInHub = data.data ? findTable(data.data.table.logicalName) : undefined;

  return (
    <div className="action-card">
      <div className="ro-title">
        {subgrid.label}
        {data.data && <span className="seg-count">{data.data.result.totalCount ?? data.data.result.rows.length}</span>}
      </div>
      {data.loading && <div className="loader-text">Loading related records…</div>}
      {data.error && <div className="section-note" dir="auto">{data.error}</div>}
      {data.data && !data.data.result.rows.length && <div className="req-dim" style={{ fontSize: 12 }}>No related records.</div>}
      {data.data && data.data.result.rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="req-table">
            <thead>
              <tr>
                {data.data.view.columns.map((column) => (
                  <th key={column.name} style={{ minWidth: Math.min(column.width, 220) }}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.result.rows.map((row, index) => {
                const id = row[`${data.data?.table.logicalName}id`];
                const target = typeof id === 'string' && opensInHub ? { table: opensInHub.table, label: opensInHub.label, id } : null;
                return (
                  <tr key={typeof id === 'string' ? id : index} style={target ? { cursor: 'pointer' } : undefined} onClick={target ? () => onOpen(target) : undefined}>
                    {data.data?.view.columns.map((column) => {
                      const text = formatCell(row, column);
                      const url = cellLink(row, column);
                      return (
                        <td key={column.name} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }} title={text}>
                          {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={linkStyle} onClick={(event) => onFileLinkClick(event, url, text)}>{text}</a> : text ? <bdi>{text}</bdi> : <span className="req-dim">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.data.result.moreRecords && <div className="req-dim" style={{ fontSize: 11, padding: '6px 16px' }}>Showing the first 10 records.</div>}
        </div>
      )}
    </div>
  );
}
