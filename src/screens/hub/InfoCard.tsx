import type { ReactNode } from 'react';
import { RichBlock } from './HubCommon';

/**
 * Shared record card of the Egypt Quick Links pages (Insurance, Booking Policy, QA Tips, CRM
 * Dictionary, Department Working Hours): a title, tags (BU, type…) and labelled sections.
 * "Band" design (user choice, 2026-09-30): teal header, sections as boxes side by side.
 */

export interface InfoSection {
  label: string;
  /** Text or rich text (HTML); empty shows a dash. */
  value: string;
  arabic?: boolean;
}

/** One card per row; `foldable` keeps the legacy folded cards (click the header to open). */
export function InfoCard({ title, tags, sections, foldable, open }: { title: string; tags: readonly (string | undefined)[]; sections: readonly InfoSection[]; foldable?: boolean; open?: boolean }) {
  const header = (
    <>
      <span className="info-title" dir="auto">{title || '—'}</span>
      <span className="info-tags">
        {tags.filter(Boolean).map((tag) => (
          <span key={tag} className="info-tag" dir="auto">{tag}</span>
        ))}
      </span>
    </>
  );
  const body: ReactNode = (
    <div className="info-sections">
      {sections.map((section) => (
        <div key={section.label} className="info-section">
          <div className="info-label">{section.label}</div>
          <div className="info-value">{section.value ? <RichBlock value={section.value} arabic={section.arabic} /> : <span className="hub-muted">—</span>}</div>
        </div>
      ))}
    </div>
  );
  const className = 'info-card info-band';
  if (foldable) {
    return (
      <details className={`${className} info-fold`} open={open}>
        <summary className="info-head">{header}</summary>
        {body}
      </details>
    );
  }
  return (
    <article className={className}>
      <div className="info-head">{header}</div>
      {body}
    </article>
  );
}
