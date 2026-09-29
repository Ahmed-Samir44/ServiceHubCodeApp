interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation before destructive or bulk actions (Delete, Deactivate), like the model-driven prompt. */
export function ConfirmDialog({ title, message, confirmLabel, danger = false, busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onCancel(); }}>
      <div className="modal-box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className="modal-hdr">
          <div className="modal-title" id="confirm-title">{title}</div>
          <div className="modal-sub" id="confirm-message">{message}</div>
        </div>
        <div className="modal-body">
          <div className="modal-btn-row">
            <button type="button" className={`btn ${danger ? 'btn-outline-danger' : 'btn-primary'}`} style={{ flex: 1 }} disabled={busy} onClick={onConfirm}>
              {busy ? 'Working…' : confirmLabel}
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
