import { Dropdown } from '../Dropdown';
import { LookupValuesPicker } from './LookupValuesPicker';
import { useState } from 'react';
import { Add, Trash } from 'iconsax-react';
import { columnMeta, type ColumnMeta } from '../../data/columnMeta';
import {
  MULTI_VALUE_OPERATORS,
  NO_VALUE_OPERATORS,
  displayValue,
  emptyGroup,
  newNodeId,
  operatorsFor,
  storedValue,
  type FilterCondition,
  type FilterGroup,
  type FilterNode,
} from '../../data/fetchQuery';

export interface FilterField {
  name: string;
  label: string;
}

interface FilterEditorProps {
  tableLabel: string;
  tableLogicalName: string;
  tableEntitySet: string;
  /** Fields that can be filtered (base-table attributes). */
  fields: readonly FilterField[];
  /** Filter currently applied (the view's own filter until the user changes it). */
  current: FilterGroup;
  /** The view's original filter, for "Reset to default". */
  viewDefault: FilterGroup;
  onApply: (filter: FilterGroup) => void;
  onClose: () => void;
}

const clone = (group: FilterGroup): FilterGroup => JSON.parse(JSON.stringify(group)) as FilterGroup;

const newCondition = (attribute = ''): FilterCondition => ({ kind: 'condition', id: newNodeId(), attribute, operator: 'eq', values: [] });

/** Replace/remove a node anywhere in the tree (immutably). */
function mapTree(group: FilterGroup, id: string, change: (node: FilterNode) => FilterNode | null): FilterGroup {
  const items: FilterNode[] = [];
  for (const item of group.items) {
    if (item.id === id) {
      const next = change(item);
      if (next) items.push(next);
    } else items.push(item.kind === 'group' ? mapTree(item, id, change) : item);
  }
  return { ...group, items };
}

/**
 * "Edit filters" — the model-driven AND/OR filter editor over the view's own conditions.
 * Starts from the filter in effect; Apply replaces the view's root filter for this session.
 */
export function FilterEditor({ tableLabel, tableLogicalName, tableEntitySet, fields, current, viewDefault, onApply, onClose }: FilterEditorProps) {
  const [draft, setDraft] = useState<FilterGroup>(() => clone(current));

  const update = (id: string, change: (node: FilterNode) => FilterNode | null) =>
    setDraft((root) => (root.id === id ? ((change(root) as FilterGroup | null) ?? emptyGroup()) : mapTree(root, id, change)));

  const fieldLabel = (name: string) => fields.find((field) => field.name === name)?.label ?? columnMeta(tableLogicalName, name)?.label ?? name;

  const renderCondition = (condition: FilterCondition) => {
    const meta: ColumnMeta | undefined = condition.attribute.includes('.') ? undefined : columnMeta(tableLogicalName, condition.attribute);
    const kind = meta?.kind ?? 'text';
    const operators = operatorsFor(kind, meta?.multiSelect ?? false);
    const knownOperator = operators.some((option) => option.value === condition.operator);
    const readOnlyRow = condition.attribute.includes('.');
    return (
      <div key={condition.id} className="attach-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1.1fr) minmax(140px,1fr) minmax(160px,1.3fr) auto', gap: 8, alignItems: 'center' }}>
        <Dropdown
          ariaLabel="Field"
          value={condition.attribute}
          disabled={readOnlyRow}
          placeholder="Select a field"
          options={[
            ...(readOnlyRow || (condition.attribute && !fields.some((field) => field.name === condition.attribute)) ? [{ value: condition.attribute, label: readOnlyRow ? condition.attribute : fieldLabel(condition.attribute) }] : []),
            ...fields.map((field) => ({ value: field.name, label: field.label })),
          ]}
          onChange={(attribute) => update(condition.id, () => ({ ...newCondition(attribute), id: condition.id }))}
        />
        <Dropdown
          ariaLabel="Operator"
          value={condition.operator}
          disabled={readOnlyRow || !condition.attribute}
          options={[...(knownOperator ? [] : [{ value: condition.operator, label: condition.operator }]), ...operators]}
          onChange={(operator) =>
            update(condition.id, (node) => ({ ...(node as FilterCondition), operator, values: NO_VALUE_OPERATORS.has(operator) || kind === 'lookup' ? [] : (node as FilterCondition).values.slice(0, MULTI_VALUE_OPERATORS.has(operator) ? undefined : 1), uiName: undefined, uiNames: undefined }))
          }
        />
        <ValueEditor
          condition={condition}
          meta={meta}
          readOnly={readOnlyRow}
          table={{ logicalName: tableLogicalName, entitySet: tableEntitySet }}
          onChange={(values, lookup) => update(condition.id, (node) => ({ ...(node as FilterCondition), values, uiName: undefined, uiNames: lookup?.names, uiType: lookup?.table }))}
        />
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Delete condition" onClick={() => update(condition.id, () => null)}>
          <Trash size={13} color="currentColor" />
        </button>
      </div>
    );
  };

  const renderGroup = (group: FilterGroup, depth: number) => (
    <div
      key={group.id}
      style={depth ? { borderInlineStart: '2px solid var(--gold-light)', paddingInlineStart: 12, margin: '6px 0 10px', background: 'var(--brand-gold-100)', borderRadius: 'var(--r-md)', padding: 10 } : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Dropdown
          ariaLabel="Group operator"
          value={group.type}
          style={{ width: 110 }}
          options={[
            { value: 'and', label: 'And' },
            { value: 'or', label: 'Or' },
          ]}
          onChange={(type) => update(group.id, (node) => ({ ...(node as FilterGroup), type: type === 'or' ? 'or' : 'and' }))}
        />
        {depth > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Delete group" onClick={() => update(group.id, () => null)}>
            <Trash size={13} color="currentColor" />
          </button>
        )}
      </div>
      {group.items.map((item) => (item.kind === 'group' ? renderGroup(item, depth + 1) : renderCondition(item)))}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => update(group.id, (node) => ({ ...(node as FilterGroup), items: [...(node as FilterGroup).items, newCondition()] }))}>
          <Add size={13} color="currentColor" /> Add row
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => update(group.id, (node) => ({ ...(node as FilterGroup), items: [...(node as FilterGroup).items, { ...emptyGroup('or'), items: [newCondition()] }] }))}>
          <Add size={13} color="currentColor" /> Add group
        </button>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay side-panel-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-box side-panel" role="dialog" aria-modal="true" aria-labelledby="filter-editor-title">
        <div className="modal-hdr">
          <div className="modal-title" id="filter-editor-title">Edit filters: {tableLabel}</div>
          <div className="filter-bar" style={{ marginTop: 8, marginBottom: 0 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(clone(viewDefault))}>
              Reset to default
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(emptyGroup())}>
              Delete all filters
            </button>
          </div>
        </div>
        <div className="modal-body">
          {renderGroup(draft, 0)}
          <div className="modal-btn-row" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={() => onApply(draft)}>
              Apply
            </button>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Value change from the editor; lookups also report the picked records' names and table. */
export type ValueChange = (values: string[], lookup?: { names: string[]; table: string | undefined }) => void;

export function ValueEditor({
  condition,
  meta,
  readOnly,
  table,
  onChange,
}: {
  condition: FilterCondition;
  meta: ColumnMeta | undefined;
  readOnly: boolean;
  /** The grid's table — needed to search the records of a lookup column. */
  table: { logicalName: string; entitySet: string };
  onChange: ValueChange;
}) {
  const { operator } = condition;
  if (NO_VALUE_OPERATORS.has(operator)) return <span className="req-dim">—</span>;
  if (readOnly) return <span className="req-dim">{condition.uiName ?? condition.values.join(', ')}</span>;

  // Lookup Equals / Does not equal: pick one or more records by name (model-driven behaviour).
  if (meta?.kind === 'lookup' && (operator === 'eq' || operator === 'ne')) {
    const names = condition.uiNames ?? (condition.uiName ? [condition.uiName] : []);
    return (
      <LookupValuesPicker
        tableEntitySet={table.entitySet}
        tableLogicalName={table.logicalName}
        attribute={condition.attribute}
        values={condition.values}
        names={condition.values.map((_, index) => names[index] ?? '')}
        onChange={(values, picked, target) => onChange(values, { names: picked, table: target })}
      />
    );
  }

  if (meta?.kind === 'choice' && meta.options.length) {
    if (MULTI_VALUE_OPERATORS.has(operator)) {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {meta.options.map((option) => {
            const checked = condition.values.includes(String(option.value));
            return (
              <label key={option.value} className="sbadge sbadge-gray" style={{ cursor: 'pointer', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(checked ? condition.values.filter((value) => value !== String(option.value)) : [...condition.values, String(option.value)])}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      );
    }
    return (
      <Dropdown
        ariaLabel="Value"
        value={condition.values[0] ?? ''}
        placeholder="Select a value"
        options={meta.options.map((option) => ({ value: String(option.value), label: option.label }))}
        onChange={(value) => onChange([value])}
      />
    );
  }

  if (meta?.kind === 'date' && operator !== 'last-x-days' && operator !== 'next-x-days') {
    return <input className="field-input" type="date" aria-label="Value" value={(condition.values[0] ?? '').slice(0, 10)} onChange={(event) => onChange([event.target.value])} />;
  }

  const numeric = meta?.kind === 'number' || operator === 'last-x-days' || operator === 'next-x-days';
  return (
    <input
      className="field-input"
      type={numeric ? 'number' : 'text'}
      aria-label="Value"
      dir="auto"
      value={displayValue(operator, condition.values[0] ?? '')}
      onChange={(event) => onChange([storedValue(operator, event.target.value)])}
    />
  );
}
