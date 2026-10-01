import { useCallback, useRef, useState } from 'react';
import { columnMeta } from '../../data/columnMeta';
import { newNodeId, NO_VALUE_OPERATORS, operatorsFor, type FilterCondition } from '../../data/fetchQuery';
import type { GridColumn } from '../../data/views';
import { Dropdown } from '../Dropdown';
import { useDismiss } from '../useDismiss';
import { ValueEditor } from './FilterEditor';

interface ColumnFilterPopoverProps {
  tableLogicalName: string;
  tableEntitySet: string;
  column: GridColumn;
  /** Viewport-derived position under the header cell (CSS px of the zoomed content). */
  left: number;
  top: number;
  /** The column's filter in effect, if any. */
  current: FilterCondition | undefined;
  onApply: (condition: FilterCondition) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Model-driven "Filter by" callout under a column header: operator + value, Apply / Clear.
 * Column filters are ANDed with the view's filter, like the MDA grid.
 */
export function ColumnFilterPopover({ tableLogicalName, tableEntitySet, column, left, top, current, onApply, onClear, onClose }: ColumnFilterPopoverProps) {
  // A linked-table column takes its kind and options from that table.
  const linkedMeta = column.linked && column.entity ? columnMeta(column.entity, column.name.slice(column.name.indexOf('.') + 1)) : undefined;
  const meta = column.linked ? linkedMeta : columnMeta(tableLogicalName, column.name);
  // Lookup values of a linked table can't be picked here (the picker works on this table): only "contains data".
  const linkedLookup = column.linked && meta?.kind === 'lookup';
  const allOperators = operatorsFor(meta?.kind ?? 'text', meta?.multiSelect ?? false);
  const operators = linkedLookup ? allOperators.filter((option) => option.value === 'not-null' || option.value === 'null') : allOperators;
  // Like the MDA: text/lookups "Contains", choices pick values from a list, dates "On".
  const kind = meta?.kind ?? 'text';
  const defaultOperator =
    kind === 'choice' ? (meta?.multiSelect ? 'contain-values' : 'in') : kind === 'date' ? 'on' : kind === 'number' || kind === 'lookup' ? 'eq' : 'like';
  const [draft, setDraft] = useState<FilterCondition>(
    () =>
      current ?? {
        kind: 'condition',
        id: newNodeId(),
        attribute: column.name,
        operator: operators.some((option) => option.value === defaultOperator) ? defaultOperator : (operators[0]?.value ?? 'eq'),
        values: [],
      },
  );
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useDismiss(ref, true, close);

  const needsValue = !NO_VALUE_OPERATORS.has(draft.operator);
  const canApply = !needsValue || draft.values.some((value) => value.trim() !== '');

  return (
    <div ref={ref} className="col-filter" role="dialog" aria-label={`Filter by ${column.label}`} style={{ left, top }}>
      <div className="col-filter-title">Filter by</div>
      <Dropdown
        ariaLabel="Operator"
        value={draft.operator}
        options={operators}
        onChange={(operator) => setDraft((prev) => ({ ...prev, operator, values: NO_VALUE_OPERATORS.has(operator) || kind === 'lookup' ? [] : prev.values, uiNames: undefined }))}
      />
      {needsValue && (
        <div className="col-filter-value">
          <ValueEditor
            condition={draft}
            meta={meta}
            readOnly={false}
            table={{ logicalName: tableLogicalName, entitySet: tableEntitySet }}
            onChange={(values, lookup) => setDraft((prev) => ({ ...prev, values, uiName: undefined, uiNames: lookup?.names, uiType: lookup?.table }))}
          />
        </div>
      )}
      <div className="col-filter-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={!canApply} onClick={() => onApply(draft)}>
          Apply
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
