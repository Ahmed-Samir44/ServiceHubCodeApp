import { useState } from 'react';

interface SaveViewDialogProps {
  defaultName: string;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}

/** "Save as new view": name the personal view that keeps the current columns, filters and sort. */
export function SaveViewDialog({ defaultName, busy, onSave, onCancel }: SaveViewDialogProps) {
  const [name, setName] = useState(defaultName);
  const trimmed = name.trim();
  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="save-view-title">
        <div className="modal-hdr">
          <div className="modal-title" id="save-view-title">Save as new view</div>
          <div className="modal-sub">Saves the current columns, filters and sort to My Views.</div>
        </div>
        <form
          className="modal-body"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed) onSave(trimmed);
          }}
        >
          <div className="form-field">
            <label className="field-lbl" htmlFor="view-name">Name <span className="field-req">*</span></label>
            <input id="view-name" className="field-input" value={name} maxLength={200} autoFocus dir="auto" onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="modal-btn-row">
            <button type="submit" className="btn btn-primary" disabled={!trimmed || busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
