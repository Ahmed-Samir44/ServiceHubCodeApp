import { useState } from 'react';
import type { TableRef } from '../../app/navigation';
import { errorMessage, updateRow } from '../../data/dataverse';
import { formFields, loadMainForm } from '../../data/forms';
import { lookupTargetTable } from '../../data/lookups';
import { useAsyncData } from '../../data/useAsyncData';
import { FieldEditor, type DraftValue } from '../form/FieldEditor';
import { RichTextField } from '../form/RichTextField';
import { SYSTEM_READ_ONLY, buildPayload, metaFor } from '../form/values';

interface BulkEditDialogProps {
  table: TableRef;
  label: string;
  ids: readonly string[];
  notify: (kind: 'success' | 'alert', text: string) => void;
  onDone: () => void;
  onClose: () => void;
}

/**
 * "Edit multiple records": the main form's editable fields start empty; only the fields the user
 * changes are written to every selected record — the same rule as the model-driven bulk edit.
 */
export function BulkEditDialog({ table, label, ids, notify, onDone, onClose }: BulkEditDialogProps) {
  const layout = useAsyncData(`bulk#${table.logicalName}`, () => loadMainForm(table.logicalName));
  const [draft, setDraft] = useState<Record<string, DraftValue>>({});
  const [busy, setBusy] = useState(false);

  const fields = (layout.data ? formFields(layout.data) : []).filter((field) => {
    const meta = metaFor(table.logicalName, field);
    return !meta.readOnly && !SYSTEM_READ_ONLY.has(field.name) && !(meta.kind === 'lookup' && !meta.navigationProperty);
  });
  const changed = Object.keys(draft).length;

  const apply = async () => {
    setBusy(true);
    let done = 0;
    const failures: string[] = [];
    try {
      const payload = await buildPayload(table.logicalName, draft);
      for (const id of ids) {
        try {
          await updateRow(table.entitySet, id, payload);
          done += 1;
        } catch (error) {
          failures.push(errorMessage(error));
        }
      }
    } catch (error) {
      failures.push(errorMessage(error));
    }
    setBusy(false);
    if (done) notify('success', `Updated ${done} record${done === 1 ? '' : 's'}.`);
    if (failures.length) notify('alert', `${failures.length} failed: ${failures[0]}`);
    onDone();
  };

  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-box detail-modal-box" style={{ maxWidth: 860, width: '96%' }} role="dialog" aria-modal="true" aria-labelledby="bulk-edit-title">
        <div className="modal-hdr">
          <div className="modal-title" id="bulk-edit-title">Edit {ids.length} records</div>
          <div className="modal-sub">{label} · only the fields you change are updated on all selected records.</div>
        </div>
        <div className="modal-body">
          {layout.loading && <div className="loader-text">Loading form…</div>}
          {layout.error && <div className="section-note" dir="auto">{layout.error}</div>}
          {fields.length > 0 && (
            <div className="grid2">
              {fields.map((field) => {
                const meta = metaFor(table.logicalName, field);
                const edited = field.name in draft;
                return (
                  <div key={field.name} className={`form-field${meta.kind === 'memo' ? ' full' : ''}`}>
                    <label className="field-lbl" htmlFor={`b-${field.name}`}>
                      {field.label}
                      {edited && <span className="sbadge sbadge-gold" style={{ marginInlineStart: 6 }}>changed</span>}
                    </label>
                    {field.richText ? (
                      <RichTextField
                        id={`b-${field.name}`}
                        html={typeof draft[field.name] === 'string' ? (draft[field.name] as string) : ''}
                        readOnly={false}
                        onChange={(value) => setDraft((items) => ({ ...items, [field.name]: value }))}
                      />
                    ) : (
                    <FieldEditor
                      id={`b-${field.name}`}
                      meta={meta}
                      readOnly={false}
                      row={{}}
                      value={edited ? draft[field.name] : meta.multiSelect ? [] : meta.kind === 'lookup' ? null : ''}
                      resolveTarget={() => lookupTargetTable(table.entitySet, table.logicalName, field.name)}
                      onOpenRelated={() => undefined}
                      onChange={(value) => setDraft((items) => ({ ...items, [field.name]: value }))}
                    />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="modal-btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" disabled={!changed || busy} onClick={() => void apply()}>
              {busy ? 'Saving…' : `Change ${changed} field${changed === 1 ? '' : 's'} on ${ids.length} records`}
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
