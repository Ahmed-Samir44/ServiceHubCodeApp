import { lazy, Suspense } from 'react';
import { sanitizeRichText } from '../../data/formatCell';

// TipTap is only downloaded the first time someone edits a rich-text field.
const RichTextEditor = lazy(() => import('./RichTextEditor'));

interface RichTextFieldProps {
  id: string;
  html: string;
  readOnly: boolean;
  onChange: (html: string) => void;
}

/** Rich-text column on a form: formatted editor when editable, formatted (sanitized) view otherwise. */
export function RichTextField({ id, html, readOnly, onChange }: RichTextFieldProps) {
  const view = (
    <div
      id={id}
      className="field-input rich-text"
      dir="auto"
      style={{ minHeight: 60, background: readOnly ? 'var(--neutral-200)' : undefined, fontSize: 12.5 }}
      dangerouslySetInnerHTML={{ __html: html ? sanitizeRichText(html) : '—' }}
    />
  );
  if (readOnly) return view;
  return (
    <Suspense fallback={view}>
      <RichTextEditor id={id} initialHtml={html} onChange={onChange} />
    </Suspense>
  );
}
