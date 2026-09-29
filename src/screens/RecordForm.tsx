import { useState } from 'react';
import { ArrowDown2, ArrowLeft, ArrowUp2, CloseCircle, Profile2User, Refresh, Share, TickCircle, Trash } from 'iconsax-react';
import type { TableRef } from '../app/navigation';
import { usePermissions } from '../app/permissionsContext';
import type { ColumnMeta } from '../data/columnMeta';
import { createRow, deleteRow, errorMessage, setRowState, updateRow, type DataverseRow } from '../data/dataverse';
import { formatCell, richTextHtml } from '../data/formatCell';
import { formFields, loadMainForm, type FormField, type RecordForm as RecordFormLayout } from '../data/forms';
import { lookupTargetTable } from '../data/lookups';
import { getRecord } from '../data/records';
import { useAsyncData } from '../data/useAsyncData';
import { FieldEditor, type DraftValue } from './form/FieldEditor';
import { AssignDialog, ShareDialog } from './form/RecordDialogs';
import { RichTextField } from './form/RichTextField';
import { SubgridView } from './form/SubgridView';
import { SYSTEM_READ_ONLY, buildPayload, currentValue, isEmptyValue, metaFor } from './form/values';
import { ConfirmDialog } from './grid/ConfirmDialog';

export interface FormTarget {
  table: TableRef;
  /** Table display name (sidebar label). */
  label: string;
  /** null = new record. */
  id: string | null;
  /** Record ids of the grid page the record was opened from, for the ↑ / ↓ record navigation. */
  siblings?: readonly string[];
}

interface RecordFormProps {
  target: FormTarget;
  notify: (kind: 'success' | 'alert', text: string) => void;
  /** A record was created, updated, deleted, assigned or (de)activated — the grid should reload. */
  onChanged: () => void;
  onClose: () => void;
}

/**
 * Model-driven style record form (New / Edit), laid out from the table's main form: tabs,
 * sections, fields and subgrids. Lookups and subgrid rows open related records in place ("Back"
 * returns); ↑ / ↓ move through the grid's records like the model-driven record navigation.
 */
export function RecordForm({ target, notify, onChanged, onClose }: RecordFormProps) {
  const [stack, setStack] = useState<FormTarget[]>([target]);
  // Bumped on every switch so the form always starts clean — also new → new after "Save & New".
  const [instance, setInstance] = useState(0);
  const current = stack[stack.length - 1];
  const replaceCurrent = (next: FormTarget) => {
    setStack((items) => [...items.slice(0, -1), next]);
    setInstance((count) => count + 1);
  };
  return (
    <FormBody
      key={`${current.table.logicalName}#${current.id ?? 'new'}#${stack.length}#${instance}`}
      target={current}
      backTo={stack.length > 1 ? stack[stack.length - 2].label : null}
      onBack={() => setStack((items) => items.slice(0, -1))}
      onOpenRelated={(related) => setStack((items) => [...items, related])}
      onNavigate={(id) => replaceCurrent({ ...current, id })}
      onNew={() => replaceCurrent({ ...current, id: null })}
      notify={notify}
      onChanged={onChanged}
      onClose={onClose}
    />
  );
}

type PendingAction = 'delete' | 'activate' | 'deactivate' | null;
type OpenDialog = 'assign' | 'share' | null;

interface FormBodyProps {
  target: FormTarget;
  backTo: string | null;
  onBack: () => void;
  onOpenRelated: (target: FormTarget) => void;
  /** Show another record in this form (after create, or ↑ / ↓). */
  onNavigate: (id: string) => void;
  /** Save & New: continue with a blank record of the same table. */
  onNew: () => void;
  notify: RecordFormProps['notify'];
  onChanged: () => void;
  onClose: () => void;
}

function FormBody({ target, backTo, onBack, onOpenRelated, onNavigate, onNew, notify, onChanged, onClose }: FormBodyProps) {
  const { table } = target;
  const isNew = target.id === null;
  const [reload, setReload] = useState(0);
  const { privileges } = usePermissions();
  const canCreate = privileges.can(table.logicalName, 'create');
  const canWrite = privileges.can(table.logicalName, 'write');
  const canDelete = privileges.can(table.logicalName, 'delete');
  const canAssign = privileges.can(table.logicalName, 'assign');
  const canShare = privileges.can(table.logicalName, 'share');
  // A new record needs Create; an existing one needs Write. Without it the form is read-only.
  const canSave = isNew ? canCreate : canWrite;
  const [draft, setDraft] = useState<Record<string, DraftValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tabIndex, setTabIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [busy, setBusy] = useState(false);

  const details = useAsyncData<[RecordFormLayout, DataverseRow]>(`${table.logicalName}#${target.id ?? 'new'}#${reload}`, () =>
    Promise.all([loadMainForm(table.logicalName), target.id ? getRecord(table.entitySet, table.logicalName, target.id) : Promise.resolve({})]),
  );
  const [layout, row] = details.data ?? [];
  const title = row && !isNew ? formatCell(row, { name: table.primaryName, kind: 'text' }, { truncate: false }) : '';
  const dirty = Object.keys(draft).length > 0;
  const active = row ? row.statecode !== 1 : true;
  const tabs = layout?.tabs ?? [];
  const activeTab = tabs[Math.min(tabIndex, Math.max(tabs.length - 1, 0))];

  const siblings = target.siblings ?? [];
  const position = target.id ? siblings.indexOf(target.id) : -1;

  const isReadOnly = (field: FormField, meta: ColumnMeta) =>
    !canSave || meta.readOnly || SYSTEM_READ_ONLY.has(field.name) || (meta.kind === 'lookup' && !meta.navigationProperty);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    for (const field of layout ? formFields(layout) : []) {
      const meta = metaFor(table.logicalName, field);
      if (!meta.required || isReadOnly(field, meta)) continue;
      // Existing records: only fields the user cleared block the save. Records created by imports or
      // integrations may already have an empty required field; editing another field must still work.
      if (!isNew && !(field.name in draft)) continue;
      const value = field.name in draft ? draft[field.name] : currentValue(row ?? {}, meta);
      if (isEmptyValue(value)) next[field.name] = `${field.label} is required.`;
    }
    setErrors(next);
    // Like the model-driven form, jump to the first tab that has a missing required field.
    const firstError = tabs.findIndex((tab) => tab.sections.some((section) => section.fields.some((field) => next[field.name])));
    if (firstError >= 0) setTabIndex(firstError);
    return !Object.keys(next).length;
  };

  const save = async (then: 'stay' | 'close' | 'new') => {
    if (!validate()) {
      notify('alert', 'Fill in the required fields first.');
      return;
    }
    setSaving(true);
    try {
      const payload = await buildPayload(table.logicalName, draft);
      if (isNew) {
        const created = await createRow(table.entitySet, payload);
        const id = created?.[`${table.logicalName}id`];
        notify('success', `${target.label}: record created.`);
        onChanged();
        if (then === 'close' || (then === 'stay' && typeof id !== 'string')) onClose();
        else if (then === 'new') onNew();
        else onNavigate(id as string);
      } else {
        if (Object.keys(payload).length) await updateRow(table.entitySet, target.id as string, payload);
        notify('success', `${target.label}: changes saved.`);
        onChanged();
        if (then === 'close') onClose();
        else if (then === 'new') onNew();
        else {
          setDraft({});
          setReload((count) => count + 1);
        }
      }
    } catch (error) {
      notify('alert', `Save failed: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const runPending = async () => {
    if (!pending || !target.id) return;
    setBusy(true);
    try {
      if (pending === 'delete') await deleteRow(table.entitySet, target.id);
      else await setRowState(table.entitySet, target.id, pending === 'activate');
      notify('success', `${target.label}: record ${pending === 'delete' ? 'deleted' : pending === 'activate' ? 'activated' : 'deactivated'}.`);
      onChanged();
      if (pending === 'delete') onClose();
      else setReload((count) => count + 1);
    } catch (error) {
      notify('alert', `${pending === 'delete' ? 'Delete' : 'Update'} failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const leave = (action: () => void) => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    action();
  };

  const errorCount = (tab: (typeof tabs)[number]) => tab.sections.reduce((sum, section) => sum + section.fields.filter((field) => errors[field.name]).length, 0);
  const footerValue = (name: string) => (row && !isNew ? formatCell(row, { name, kind: name.endsWith('on') ? 'date' : 'lookup' }, { truncate: false }) : '');

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) leave(onClose); }}>
      <div className="modal-box detail-modal-box" style={{ maxWidth: 1040, width: '96%' }} role="dialog" aria-modal="true" aria-labelledby="record-title">
        <div className="modal-hdr">
          {backTo && (
            <button type="button" className="back-link" onClick={() => leave(onBack)}>
              <ArrowLeft size={12} color="currentColor" /> Back to {backTo}
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="modal-title" id="record-title" dir="auto">
                {isNew ? 'New record' : title || target.label}
                {dirty && <span className="sbadge sbadge-amber" style={{ marginInlineStart: 8 }}>Unsaved changes</span>}
                {!isNew && row && !active && <span className="sbadge sbadge-gray" style={{ marginInlineStart: 8 }}>Inactive</span>}
              </div>
              <div className="modal-sub">
                {target.label}
                {layout && ` · ${layout.name}`}
              </div>
            </div>
            {position >= 0 && siblings.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} aria-label="Record navigation">
                <button type="button" className="btn btn-outline btn-sm" aria-label="Previous record" disabled={position === 0} onClick={() => leave(() => onNavigate(siblings[position - 1]))}>
                  <ArrowUp2 size={13} color="currentColor" />
                </button>
                <span className="req-dim" style={{ fontSize: 11 }}>{position + 1} / {siblings.length}</span>
                <button type="button" className="btn btn-outline btn-sm" aria-label="Next record" disabled={position === siblings.length - 1} onClick={() => leave(() => onNavigate(siblings[position + 1]))}>
                  <ArrowDown2 size={13} color="currentColor" />
                </button>
              </div>
            )}
          </div>
          <div className="filter-bar" style={{ marginTop: 10, marginBottom: 0 }}>
            {canSave && (
              <>
                <button type="button" className="btn btn-primary" disabled={saving || !layout} onClick={() => void save('stay')}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn btn-outline" disabled={saving || !layout} onClick={() => void save('close')}>
                  Save &amp; Close
                </button>
                {canCreate && (
                  <button type="button" className="btn btn-outline" disabled={saving || !layout} onClick={() => void save('new')}>
                    Save &amp; New
                  </button>
                )}
              </>
            )}
            {!canSave && <span className="sbadge sbadge-gray">Read-only: you don’t have permission to {isNew ? 'create' : 'edit'} this record</span>}
            {!isNew && (
              <>
                {canWrite && (
                  <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setPending(active ? 'deactivate' : 'activate')}>
                    {active ? <CloseCircle size={14} color="currentColor" /> : <TickCircle size={14} color="currentColor" />}
                    {active ? 'Deactivate' : 'Activate'}
                  </button>
                )}
                {canDelete && (
                  <button type="button" className="btn btn-outline-danger" disabled={saving} onClick={() => setPending('delete')}>
                    <Trash size={14} color="currentColor" /> Delete
                  </button>
                )}
                {canAssign && (
                  <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setDialog('assign')}>
                    <Profile2User size={14} color="currentColor" /> Assign
                  </button>
                )}
                {canShare && (
                  <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setDialog('share')}>
                    <Share size={14} color="currentColor" /> Share
                  </button>
                )}
                <button type="button" className="btn btn-outline" disabled={saving} onClick={() => leave(() => { setDraft({}); setErrors({}); setReload((count) => count + 1); })}>
                  <Refresh size={14} color="currentColor" /> Refresh
                </button>
              </>
            )}
            <button type="button" className="btn btn-ghost" style={{ marginInlineStart: 'auto' }} onClick={() => leave(onClose)}>
              Close
            </button>
          </div>
          {tabs.length > 1 && (
            <div className="seg-group" role="tablist" aria-label="Form tabs" style={{ marginTop: 12, maxWidth: '100%', overflowX: 'auto' }}>
              {tabs.map((tab, index) => {
                const count = errorCount(tab);
                return (
                  <button key={tab.label + index} type="button" role="tab" aria-selected={tab === activeTab} className={`seg-btn${tab === activeTab ? ' active' : ''}`} onClick={() => setTabIndex(index)}>
                    {tab.label}
                    {count > 0 && <span className="seg-count" style={{ color: 'var(--danger)' }}>{count}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-body">
          {details.loading && (
            <div className="loader-box" role="status">
              <div className="loader-ring" />
              <div className="loader-text">{isNew ? 'Loading form…' : 'Loading record…'}</div>
            </div>
          )}
          {details.error && (
            <div className="empty-state" role="alert">
              <div className="empty-title">Couldn’t load this record</div>
              <div className="empty-sub" dir="auto">{details.error}</div>
            </div>
          )}
          {row &&
            activeTab?.sections.map((section, sectionIndex) => (
              <div key={section.label + sectionIndex} className="ro-card">
                <div className="ro-title">{section.label}</div>
                {section.fields.length > 0 && (
                  <div className="grid2">
                    {section.fields.map((field) => {
                      const meta = metaFor(table.logicalName, field);
                      // Rich text: the form uses the rich editor control, or the stored value is HTML.
                      const rich = field.richText || richTextHtml(row, field) !== null;
                      const updateDraft = (value: DraftValue) => {
                        setDraft((items) => ({ ...items, [field.name]: value }));
                        if (errors[field.name]) setErrors((items) => { const next = { ...items }; delete next[field.name]; return next; });
                      };
                      return (
                        <div key={field.name} className={`form-field${rich || meta.kind === 'memo' ? ' full' : ''}`}>
                          <label className="field-lbl" htmlFor={`f-${field.name}`}>
                            {field.label}
                            {meta.required && !isReadOnly(field, meta) && <span className="field-req"> *</span>}
                          </label>
                          {rich ? (
                            <RichTextField
                              id={`f-${field.name}`}
                              html={typeof draft[field.name] === 'string' ? (draft[field.name] as string) : typeof row[field.name] === 'string' ? (row[field.name] as string) : ''}
                              readOnly={isReadOnly(field, meta)}
                              onChange={updateDraft}
                            />
                          ) : (
                            <FieldEditor
                              id={`f-${field.name}`}
                              meta={meta}
                              readOnly={isReadOnly(field, meta)}
                              row={row}
                              value={field.name in draft ? draft[field.name] : currentValue(row, meta)}
                              resolveTarget={() => lookupTargetTable(table.entitySet, table.logicalName, field.name, row)}
                              onOpenRelated={(related) => leave(() => onOpenRelated(related))}
                              onChange={updateDraft}
                            />
                          )}
                          {errors[field.name] && <div className="field-err">{errors[field.name]}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {section.subgrids.map((subgrid) =>
                  target.id ? (
                    <SubgridView
                      key={subgrid.id}
                      subgrid={subgrid}
                      parentTable={table.logicalName}
                      parentId={target.id}
                      reloadKey={reload}
                      onOpen={(related) => leave(() => onOpenRelated(related))}
                    />
                  ) : (
                    <div key={subgrid.id} className="section-note">{subgrid.label}: save the record first to add related records.</div>
                  ),
                )}
              </div>
            ))}
          {row && !isNew && (
            // Model-driven form footer: ownership and audit stamps.
            <div className="kv-grid ro-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '4px 16px' }}>
              {[
                ['Owner', footerValue('ownerid')],
                ['Status', formatCell(row, { name: 'statecode', kind: 'choice' })],
                ['Created By', footerValue('createdby')],
                ['Created On', footerValue('createdon')],
                ['Modified By', footerValue('modifiedby')],
                ['Modified On', footerValue('modifiedon')],
              ].map(([label, value]) => (
                <div key={label} className="kv-item">
                  <span className="k">{label}</span>
                  <span className="v" dir="auto">{value || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {pending && (
        <ConfirmDialog
          title={pending === 'delete' ? 'Confirm Deletion' : pending === 'activate' ? 'Confirm Activation' : 'Confirm Deactivation'}
          message={pending === 'delete' ? "Do you want to permanently delete this record? You can't undo this action." : `Do you want to ${pending} this record?`}
          confirmLabel={pending === 'delete' ? 'Delete' : pending === 'activate' ? 'Activate' : 'Deactivate'}
          danger={pending !== 'activate'}
          busy={busy}
          onConfirm={() => void runPending()}
          onCancel={() => setPending(null)}
        />
      )}
      {dialog === 'assign' && target.id && (
        <AssignDialog table={table} ids={[target.id]} notify={notify} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChanged(); setReload((count) => count + 1); }} />
      )}
      {dialog === 'share' && target.id && (
        <ShareDialog table={table} ids={[target.id]} notify={notify} onClose={() => setDialog(null)} onDone={() => setDialog(null)} />
      )}
    </div>
  );
}
