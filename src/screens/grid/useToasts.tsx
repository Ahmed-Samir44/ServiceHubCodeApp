import { useCallback, useRef, useState } from 'react';

export interface Toast {
  id: number;
  kind: 'success' | 'alert';
  text: string;
}

const TOAST_MS = 5000;

/** Short success / error notices (base.css .toast-rack), auto-dismissed. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((toast) => toast.id !== id)), []);

  const notify = useCallback(
    (kind: Toast['kind'], text: string) => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((items) => [...items, { id, kind, text }]);
      window.setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  const rack = toasts.length ? (
    <div className="toast-rack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`} onClick={() => dismiss(toast.id)} dir="auto">
          {toast.text}
        </div>
      ))}
    </div>
  ) : null;

  return { notify, rack };
}
