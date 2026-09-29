import { useState, type ReactNode } from 'react';
import type { TableRef } from '../../app/navigation';
import { errorMessage } from '../../data/dataverse';
import { assignRecord, shareRecord, type AccessRight, type Principal } from '../../data/recordActions';
import { PrincipalPicker } from './PrincipalPicker';

interface DialogProps {
  table: TableRef;
  /** Records to act on (one from the form, one or more from the grid). */
  ids: readonly string[];
  notify: (kind: 'success' | 'alert', text: string) => void;
  onDone: () => void;
  onClose: () => void;
}

async function forEachRecord(ids: readonly string[], action: (id: string) => Promise<void>): Promise<{ done: number; failures: string[] }> {
  let done = 0;
  const failures: string[] = [];
  for (const id of ids) {
    try {
      await action(id);
      done += 1;
    } catch (error) {
      failures.push(errorMessage(error));
    }
  }
  return { done, failures };
}

function DialogShell({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-box" style={{ maxWidth: 480 }} role="dialog" aria-modal="true" aria-labelledby="record-dialog-title">
        <div className="modal-hdr">
          <div className="modal-title" id="record-dialog-title">{title}</div>
          <div className="modal-sub">{sub}</div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Assign: pick the new owner (user or team) for the record(s). */
export function AssignDialog({ table, ids, notify, onDone, onClose }: DialogProps) {
  const [owner, setOwner] = useState<Principal | null>(null);
  const [busy, setBusy] = useState(false);
  const assign = async () => {
    if (!owner) return;
    setBusy(true);
    const { done, failures } = await forEachRecord(ids, (id) => assignRecord(table, id, owner));
    setBusy(false);
    if (done) notify('success', `Assigned ${done} record${done === 1 ? '' : 's'} to ${owner.name}.`);
    if (failures.length) notify('alert', `${failures.length} failed: ${failures[0]}`);
    onDone();
  };
  return (
    <DialogShell title={`Assign ${ids.length === 1 ? 'record' : `${ids.length} records`}`} sub="Choose the user or team that will own it.">
      <div className="form-field">
        <label className="field-lbl">Assign to</label>
        <PrincipalPicker value={owner} onChange={setOwner} />
      </div>
      <div className="modal-btn-row">
        <button type="button" className="btn btn-primary" disabled={!owner || busy} onClick={() => void assign()}>{busy ? 'Assigning…' : 'Assign'}</button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </DialogShell>
  );
}

const SHARE_RIGHTS: { right: AccessRight; label: string }[] = [
  { right: 'ReadAccess', label: 'Read' },
  { right: 'WriteAccess', label: 'Write' },
  { right: 'DeleteAccess', label: 'Delete' },
  { right: 'AppendAccess', label: 'Append' },
  { right: 'AppendToAccess', label: 'Append To' },
  { right: 'AssignAccess', label: 'Assign' },
  { right: 'ShareAccess', label: 'Share' },
];

/** Share: grant a user or team access rights on the record(s). */
export function ShareDialog({ table, ids, notify, onDone, onClose }: DialogProps) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [rights, setRights] = useState<AccessRight[]>(['ReadAccess']);
  const [busy, setBusy] = useState(false);
  const share = async () => {
    if (!principal || !rights.length) return;
    setBusy(true);
    const { done, failures } = await forEachRecord(ids, (id) => shareRecord(table, id, principal, rights));
    setBusy(false);
    if (done) notify('success', `Shared ${done} record${done === 1 ? '' : 's'} with ${principal.name}.`);
    if (failures.length) notify('alert', `${failures.length} failed: ${failures[0]}`);
    onDone();
  };
  return (
    <DialogShell title={`Share ${ids.length === 1 ? 'record' : `${ids.length} records`}`} sub="Give a user or team access to this record.">
      <div className="form-field">
        <label className="field-lbl">Share with</label>
        <PrincipalPicker value={principal} onChange={setPrincipal} />
      </div>
      <div className="form-field">
        <label className="field-lbl">Permissions</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SHARE_RIGHTS.map(({ right, label }) => {
            const checked = rights.includes(right);
            return (
              <label key={right} className={`sbadge ${checked ? 'sbadge-gold' : 'sbadge-gray'}`} style={{ cursor: 'pointer', gap: 4 }}>
                <input type="checkbox" checked={checked} onChange={() => setRights((items) => (checked ? items.filter((item) => item !== right) : [...items, right]))} />
                {label}
              </label>
            );
          })}
        </div>
      </div>
      <div className="modal-btn-row">
        <button type="button" className="btn btn-primary" disabled={!principal || !rights.length || busy} onClick={() => void share()}>{busy ? 'Sharing…' : 'Share'}</button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </DialogShell>
  );
}
