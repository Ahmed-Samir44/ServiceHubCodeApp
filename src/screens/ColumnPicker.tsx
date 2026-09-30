import { useState } from 'react';
import { ArrowDown2, ArrowUp2, CloseCircle, SearchNormal1 } from 'iconsax-react';
import type { GridColumn } from '../data/views';

interface ColumnPickerProps {
  /** Columns shown now, in order. */
  current: readonly GridColumn[];
  /** Every column the table offers (view columns + table attributes). */
  available: readonly GridColumn[];
  /** True when the grid currently uses a saved custom set instead of the view's columns. */
  customized: boolean;
  onApply: (names: string[]) => void;
  onReset: () => void;
  onClose: () => void;
}

/** "Edit columns" dialog: add, remove and reorder grid columns for one view. */
export function ColumnPicker({ current, available, customized, onApply, onReset, onClose }: ColumnPickerProps) {
  const [selected, setSelected] = useState<string[]>(() => current.map((column) => column.name));
  const [query, setQuery] = useState('');

  const byName = new Map<string, GridColumn>([...available, ...current].map((column) => [column.name, column]));
  // Spaces ignored, so "doctor key" finds "DoctorKey" and vice versa.
  const compact = (text: string) => text.toLowerCase().replace(/\s+/g, '');
  const search = compact(query);
  const addable = available.filter(
    (column) =>
      !selected.includes(column.name) &&
      (!search || compact(column.label).includes(search) || column.name.toLowerCase().includes(search)),
  );

  const move = (index: number, delta: number) =>
    setSelected((names) => {
      const next = [...names];
      const [name] = next.splice(index, 1);
      next.splice(index + delta, 0, name);
      return next;
    });

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-box detail-modal-box" role="dialog" aria-modal="true" aria-labelledby="column-picker-title">
        <div className="modal-hdr">
          <div className="modal-title" id="column-picker-title">Edit columns</div>
          <div className="modal-sub">Choose which columns this view shows. Saved in this browser only.</div>
        </div>
        <div className="modal-body">
          <div className="sub-hdr">Shown ({selected.length})</div>
          {selected.map((name, index) => (
            <div key={name} className="attach-row">
              <span style={{ flex: 1, minWidth: 0 }}>{byName.get(name)?.label ?? name}</span>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp2 size={12} color="currentColor" />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Move down" disabled={index === selected.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown2 size={12} color="currentColor" />
              </button>
              <button
                type="button"
                className="btn btn-outline-danger btn-sm"
                aria-label={`Remove ${byName.get(name)?.label ?? name}`}
                disabled={selected.length === 1}
                onClick={() => setSelected((names) => names.filter((item) => item !== name))}
              >
                <CloseCircle size={12} color="currentColor" />
              </button>
            </div>
          ))}

          <div className="sub-hdr">Add columns</div>
          <div className="form-field">
            <div className="search-select">
              <span className="ss-icon">
                <SearchNormal1 size={12} color="currentColor" />
              </span>
              <input
                className="field-input"
                placeholder="Search columns…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search columns"
              />
            </div>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
            {addable.map((column) => (
              <div
                key={column.name}
                className="ss-row"
                role="button"
                tabIndex={0}
                onClick={() => setSelected((names) => [...names, column.name])}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected((names) => [...names, column.name]);
                  }
                }}
              >
                + {column.label}
              </div>
            ))}
            {!addable.length && <div className="ss-empty">No more columns match.</div>}
          </div>

          <div className="modal-btn-row">
            <button type="button" className="btn btn-primary" onClick={() => onApply(selected)}>
              Apply
            </button>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
          </div>
          {customized && (
            <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={onReset}>
              Reset to view default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
