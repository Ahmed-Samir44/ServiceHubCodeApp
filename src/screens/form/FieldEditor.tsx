import { useState } from 'react';
import { SearchNormal1 } from 'iconsax-react';
import { findTable } from '../../app/navigation';
import { onFileLinkClick } from '../../data/fileLinks';
import type { ColumnMeta } from '../../data/columnMeta';
import type { DataverseRow } from '../../data/dataverse';
import { errorMessage } from '../../data/dataverse';
import { cellLink, formatCell } from '../../data/formatCell';
import { lookupTableInfo, searchLookup, type LookupOption } from '../../data/lookups';
import type { FormTarget } from '../RecordForm';
import { Dropdown } from '../Dropdown';

export interface LookupValue {
  id: string;
  name: string;
  /** Logical name of the referenced table. */
  table: string;
}

/** Editor state of one field: text/number/date/choice as string, multi-select as string[], lookup as LookupValue. */
export type DraftValue = string | string[] | LookupValue | null;

interface FieldEditorProps {
  id: string;
  meta: ColumnMeta;
  readOnly: boolean;
  row: DataverseRow;
  value: DraftValue;
  resolveTarget: () => Promise<string | null>;
  onOpenRelated: (target: FormTarget) => void;
  onChange: (value: DraftValue) => void;
}

const linkStyle = { color: 'var(--gold-dark)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' } as const;

/** One form input, chosen by the column's Dataverse type (like the model-driven form controls). */
export function FieldEditor({ id, meta, readOnly, row, value, resolveTarget, onOpenRelated, onChange }: FieldEditorProps) {
  if (meta.kind === 'lookup') {
    return <LookupEditor id={id} meta={meta} readOnly={readOnly} value={value as LookupValue | null} resolveTarget={resolveTarget} onOpenRelated={onOpenRelated} onChange={onChange} />;
  }

  if (readOnly) {
    const text = formatCell(row, meta, { truncate: false });
    const url = cellLink(row, meta);
    return (
      <div className="field-input" style={{ background: 'var(--neutral-200)', color: 'var(--text-body)', minHeight: 36, whiteSpace: 'pre-wrap' }} dir="auto">
        {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={linkStyle} onClick={(event) => onFileLinkClick(event, url, text)}>{text}</a> : text || '—'}
      </div>
    );
  }

  if (meta.kind === 'choice' && meta.multiSelect) {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-labelledby={id}>
        {meta.options.map((option) => {
          const checked = selected.includes(String(option.value));
          return (
            <label key={option.value} className="sbadge sbadge-gray" style={{ cursor: 'pointer', gap: 4 }}>
              <input type="checkbox" checked={checked} onChange={() => onChange(checked ? selected.filter((item) => item !== String(option.value)) : [...selected, String(option.value)])} />
              {option.label}
            </label>
          );
        })}
      </div>
    );
  }

  if (meta.kind === 'choice') {
    return (
      <Dropdown
        id={id}
        value={typeof value === 'string' ? value : ''}
        options={[{ value: '', label: '--Select--' }, ...meta.options.map((option) => ({ value: String(option.value), label: option.label }))]}
        onChange={onChange}
      />
    );
  }

  const text = typeof value === 'string' ? value : '';
  if (meta.kind === 'memo') {
    return <textarea id={id} className="field-input" rows={4} maxLength={meta.maxLength} dir="auto" value={text} onChange={(event) => onChange(event.target.value)} />;
  }
  return (
    <input
      id={id}
      className="field-input"
      type={meta.kind === 'number' ? 'number' : meta.kind === 'date' ? 'date' : 'text'}
      maxLength={meta.kind === 'text' ? meta.maxLength : undefined}
      dir="auto"
      value={text}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

interface LookupEditorProps {
  id: string;
  meta: ColumnMeta;
  readOnly: boolean;
  value: LookupValue | null;
  resolveTarget: () => Promise<string | null>;
  onOpenRelated: (target: FormTarget) => void;
  onChange: (value: DraftValue) => void;
}

/** Lookup control: shows the linked record (opens it if it's a ServiceHub table) and searches its table. */
function LookupEditor({ id, meta, readOnly, value, resolveTarget, onOpenRelated, onChange }: LookupEditorProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LookupOption[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [targetTable, setTargetTable] = useState<string | null>(value?.table || null);

  const related = value?.table ? findTable(value.table) : undefined;

  const search = async (text: string) => {
    setOpen(true);
    setStatus('Searching…');
    try {
      const table = targetTable ?? (await resolveTarget());
      if (!table) {
        setStatus('Couldn’t find which table this lookup points to.');
        return;
      }
      setTargetTable(table);
      const info = await lookupTableInfo(table);
      if (!info) {
        setStatus(`Couldn’t read the ${table} table to search it.`);
        return;
      }
      const results = await searchLookup(info, text);
      setOptions(results);
      setStatus(results.length ? null : 'No records found.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const valueView = value ? (
    related ? (
      <button type="button" style={linkStyle} onClick={() => onOpenRelated({ table: related.table, label: related.label, id: value.id })}>
        <bdi>{value.name}</bdi>
      </button>
    ) : (
      <bdi>{value.name}</bdi>
    )
  ) : null;

  if (readOnly) {
    return (
      <div className="field-input" style={{ background: 'var(--neutral-200)', color: 'var(--text-body)', minHeight: 36 }}>
        {valueView ?? '—'}
      </div>
    );
  }

  return (
    <div className="search-select">
      {value && !open ? (
        <div className="field-input" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingInlineStart: 30 }}>
          <span className="ss-icon"><SearchNormal1 size={12} color="currentColor" /></span>
          {valueView}
          <button type="button" className="cs-clear" aria-label={`Clear ${meta.label}`} onClick={() => onChange(null)}>×</button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto', marginInlineEnd: 20 }} onClick={() => void search('')}>
            Change
          </button>
        </div>
      ) : (
        <>
          <span className="ss-icon"><SearchNormal1 size={12} color="currentColor" /></span>
          <input
            id={id}
            className="field-input"
            placeholder={`Look for ${meta.label}`}
            dir="auto"
            value={query}
            onFocus={() => void search(query)}
            onChange={(event) => {
              setQuery(event.target.value);
              void search(event.target.value);
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 200)}
          />
        </>
      )}
      <div className={`ss-list${open ? ' open' : ''}`} role="listbox">
        {status && <div className="ss-empty">{status}</div>}
        {!status &&
          options.map((option) => (
            <div
              key={option.id}
              className="ss-row"
              role="option"
              aria-selected={value?.id === option.id}
              tabIndex={0}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange({ id: option.id, name: option.name, table: targetTable ?? '' });
                setQuery('');
                setOpen(false);
              }}
            >
              <bdi>{option.name}</bdi>
              {option.detail && <div className="ss-row-detail"><bdi>{option.detail}</bdi></div>}
            </div>
          ))}
      </div>
    </div>
  );
}
