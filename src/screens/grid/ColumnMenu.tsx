import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Filter, FilterRemove, Maximize3, Sort, TickSquare } from 'iconsax-react';
import type { GridColumn } from '../../data/views';

export interface ColumnMenuAnchor {
  column: GridColumn;
  /** Viewport position of the header cell (menu is fixed-positioned so the grid's scroll box can't clip it). */
  left: number;
  top: number;
}

interface ColumnMenuProps {
  anchor: ColumnMenuAnchor;
  sortedDescending: boolean | null;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  width: number;
  onSort: (descending: boolean) => void;
  onFilter: () => void;
  /** The column has a filter in effect (shows "Clear filter"). */
  filtered: boolean;
  /** The user sorted by this column (shows "Clear sort", back to the view's own sort). */
  customSorted: boolean;
  onClearSort: () => void;
  onClearFilter: () => void;
  onWidth: (width: number) => void;
  onMove: (delta: -1 | 1) => void;
  onClose: () => void;
}

const rowStyle = { display: 'flex', alignItems: 'center', gap: 8 } as const;

/** Model-driven column header menu: A to Z, Z to A, Filter by, Clear filter, Column width, Move left/right. */
export function ColumnMenu({ anchor, sortedDescending, canMoveLeft, canMoveRight, width, onSort, onFilter, filtered, onClearFilter, customSorted, onClearSort, onWidth, onMove, onClose }: ColumnMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [editingWidth, setEditingWidth] = useState(false);
  const [widthDraft, setWidthDraft] = useState(String(width));
  const sortable = !anchor.column.linked;

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  const item = (label: string, icon: ReactNode, action: () => void, options: { disabled?: boolean; checked?: boolean } = {}) => (
    <div
      className="ss-row"
      role="menuitem"
      tabIndex={options.disabled ? -1 : 0}
      aria-disabled={options.disabled || undefined}
      style={{ ...rowStyle, opacity: options.disabled ? 0.45 : 1, cursor: options.disabled ? 'not-allowed' : 'pointer' }}
      onClick={options.disabled ? undefined : action}
      onKeyDown={(event) => {
        if (!options.disabled && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          action();
        }
      }}
    >
      <span style={{ width: 14, display: 'inline-flex' }}>{options.checked ? <TickSquare size={14} color="currentColor" variant="Bold" /> : null}</span>
      {icon}
      {label}
    </div>
  );

  return (
    <div
      ref={menuRef}
      className="ss-list open"
      role="menu"
      aria-label={`${anchor.column.label} column`}
      style={{ position: 'fixed', left: anchor.left, top: anchor.top, right: 'auto', width: 220, maxHeight: 'none', zIndex: 400 }}
    >
      {item('A to Z', <ArrowUp size={14} color="currentColor" />, () => onSort(false), { disabled: !sortable, checked: sortedDescending === false })}
      {item('Z to A', <ArrowDown size={14} color="currentColor" />, () => onSort(true), { disabled: !sortable, checked: sortedDescending === true })}
      {customSorted && item('Clear sort', <Sort size={14} color="currentColor" />, onClearSort)}
      {item('Filter by', <Filter size={14} color="currentColor" />, onFilter, { disabled: !sortable })}
      {filtered && item('Clear filter', <FilterRemove size={14} color="currentColor" />, onClearFilter)}
      {editingWidth ? (
        <div className="ss-row" style={rowStyle}>
          <input
            className="field-input"
            type="number"
            min={40}
            max={800}
            value={widthDraft}
            autoFocus
            aria-label="Column width in pixels"
            onChange={(event) => setWidthDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onWidth(Number(widthDraft));
            }}
            style={{ padding: '5px 8px' }}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onWidth(Number(widthDraft))}>
            Set
          </button>
        </div>
      ) : (
        item('Column width', <Maximize3 size={14} color="currentColor" />, () => setEditingWidth(true))
      )}
      {item('Move left', <ArrowLeft size={14} color="currentColor" />, () => onMove(-1), { disabled: !canMoveLeft })}
      {item('Move right', <ArrowRight size={14} color="currentColor" />, () => onMove(1), { disabled: !canMoveRight })}
    </div>
  );
}
