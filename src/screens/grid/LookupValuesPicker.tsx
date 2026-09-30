import { useCallback, useEffect, useRef, useState } from 'react';
import { CloseCircle, SearchNormal1 } from 'iconsax-react';
import { lookupTableInfo, lookupTargetTable, searchLookup, type LookupOption } from '../../data/lookups';
import { useDismiss } from '../useDismiss';

interface LookupValuesPickerProps {
  tableEntitySet: string;
  tableLogicalName: string;
  attribute: string;
  /** Selected record ids with their names (same order). */
  values: string[];
  names: string[];
  onChange: (values: string[], names: string[], targetTable: string | undefined) => void;
}

/**
 * Model-driven lookup filter value: search the lookup's table by name and pick one or more
 * records (shown as removable chips). The condition then matches those exact records.
 */
export function LookupValuesPicker({ tableEntitySet, tableLogicalName, attribute, values, names, onChange }: LookupValuesPickerProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ key: string; options: LookupOption[] } | null>(null);
  const [target, setTarget] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  // Search (debounced) whenever the menu is open and the text changes.
  const searchKey = open ? text.trim() : null;
  useEffect(() => {
    if (searchKey === null) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const targetTable = await lookupTargetTable(tableEntitySet, tableLogicalName, attribute);
        const info = targetTable ? await lookupTableInfo(targetTable) : null;
        if (!info) {
          if (!cancelled) setError('Couldn’t find the related table for this column.');
          return;
        }
        const options = await searchLookup(info, searchKey);
        if (!cancelled) {
          setTarget(info.logicalName);
          setError('');
          setResults({ key: searchKey, options });
        }
      } catch {
        if (!cancelled) setError('Search failed. Try again.');
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchKey, tableEntitySet, tableLogicalName, attribute]);

  const loading = open && searchKey !== null && results?.key !== searchKey && !error;
  const toggle = (option: LookupOption) => {
    const index = values.indexOf(option.id);
    if (index >= 0) onChange(values.filter((_, i) => i !== index), names.filter((_, i) => i !== index), target);
    else onChange([...values, option.id], [...names, option.name], target);
  };

  return (
    <div className="dd lookup-pick" ref={ref}>
      {values.length > 0 && (
        <div className="lookup-pick-chips">
          {values.map((id, index) => (
            <span key={id} className="lookup-chip" dir="auto">
              {names[index] || id}
              <button type="button" aria-label={`Remove ${names[index] || id}`} onClick={() => onChange(values.filter((_, i) => i !== index), names.filter((_, i) => i !== index), target)}>
                <CloseCircle size={14} color="currentColor" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="lookup-pick-search">
        <SearchNormal1 size={14} color="currentColor" aria-hidden="true" />
        <input
          className="field-input"
          dir="auto"
          value={text}
          placeholder="Search records…"
          aria-label="Search records"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
        />
      </div>
      {open && (
        <div className="dd-menu dd-list" role="listbox" aria-multiselectable="true">
          {error ? (
            <div className="dd-empty">{error}</div>
          ) : loading ? (
            <div className="dd-empty">Searching…</div>
          ) : results && results.options.length === 0 ? (
            <div className="dd-empty">No records found</div>
          ) : (
            results?.options.map((option) => {
              const selected = values.includes(option.id);
              return (
                <label key={option.id} className={`dd-opt dd-check${selected ? ' selected' : ''}`} dir="auto">
                  <input type="checkbox" checked={selected} onChange={() => toggle(option)} />
                  <span>
                    {option.name || option.id}
                    {option.detail && <span className="ss-row-detail">{option.detail}</span>}
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
