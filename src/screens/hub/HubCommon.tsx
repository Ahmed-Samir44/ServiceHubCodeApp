import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Copy, Filter, SearchNormal1, TickCircle } from 'iconsax-react';
import { sanitizeRichText } from '../../data/formatCell';
import { clearHubCache } from '../../data/hub/common';
import { useAsyncData } from '../../data/useAsyncData';
import { Dropdown } from '../Dropdown';
import { useDismiss } from '../useDismiss';

/** Loading / error / empty states shared by the Service Hub sections. */
export function HubLoading({ label }: { label: string }) {
  return (
    <div className="loader-box" role="status">
      <div className="loader-ring" />
      <div className="loader-text">{label}</div>
    </div>
  );
}

export function HubError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <div className="empty-title">{title}</div>
      <div className="empty-sub" dir="auto">{message}</div>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function HubEmpty({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{sub}</div>
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
}

/** Single-choice filter (label + native select), the legacy "All …" dropdowns. */
export function FilterSelect({ label, value, allLabel, options, onChange }: { label: string; value: string; allLabel: string; options: readonly Option[]; onChange: (value: string) => void }) {
  return (
    <div className="hub-filter">
      <span className="field-lbl">{label}</span>
      <Dropdown ariaLabel={label} value={value} options={[{ value: '', label: allLabel }, ...options]} onChange={onChange} />
    </div>
  );
}

export interface MultiOption extends Option {
  /** Rendered indented under a group entry (e.g. the Alex hospitals). */
  child?: boolean;
  /** Group entry: toggles all `values` together. */
  values?: readonly string[];
}

/** Multi-choice dropdown (the legacy Business Unit filter). */
export function FilterMultiSelect({ label, allLabel, options, selected, onChange }: { label: string; allLabel: string; options: readonly MultiOption[]; selected: readonly string[]; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const isSelected = (option: MultiOption) =>
    option.values ? option.values.length > 0 && option.values.every((value) => selected.includes(value)) : selected.includes(option.value);

  const toggle = (option: MultiOption) => {
    const values = option.values ?? [option.value];
    const next = isSelected(option) ? selected.filter((value) => !values.includes(value)) : [...new Set([...selected, ...values])];
    onChange(next);
  };

  return (
    <div className={`hub-filter dd${open ? ' open' : ''}`} ref={ref}>
      <span className="field-lbl">{label}</span>
      <button type="button" className="field-input dd-btn" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>{selected.length === 0 ? allLabel : `${selected.length} selected`}</span>
        <span className="dd-arrow" aria-hidden="true">▼</span>
      </button>
      {open && (
        <div className="dd-menu dd-list" role="listbox" aria-multiselectable="true">
          {options.map((option) => (
            <label key={option.value} className={`dd-opt dd-check${isSelected(option) ? ' selected' : ''}${option.child ? ' child' : ''}${option.values ? ' group' : ''}`}>
              <input type="checkbox" checked={isSelected(option)} onChange={() => toggle(option)} />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="hub-filter hub-search">
      <span className="field-lbl">{label}</span>
      <span className="hub-search-wrap">
        <SearchNormal1 size={14} color="currentColor" aria-hidden="true" />
        <input className="field-input" type="search" dir="auto" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  );
}

/**
 * Filter panel ("Pills" design, user choice 2026-09-30): a header with the results count and
 * "Clear All Filters", then each filter as a rounded chip with its label inside; the search box
 * (and a Refresh button, when the page has one) comes last: at the end of the chips' row when it
 * fits, else on the next line.
 */
export function FilterPanel({ children, summary, canClear, onClear }: { children: ReactNode; summary: string; canClear: boolean; onClear: () => void }) {
  return (
    <div className="bento filter-panel">
      <div className="fp-head">
        <span className="fp-title">
          <Filter size={16} color="currentColor" variant="Bulk" /> Filters
        </span>
        <span className="hub-count" role="status">{summary}</span>
        <button type="button" className="btn btn-outline btn-sm fp-clear" disabled={!canClear} onClick={onClear}>
          Clear All Filters
        </button>
      </div>
      <div className="hub-filters">{children}</div>
    </div>
  );
}

/**
 * Lists and paragraphs without an explicit direction get dir="auto", so bullets sit on the side of
 * their own (Arabic or English) text — the legacy renderAsPoints rule. Runs on sanitized HTML.
 */
const autoDirection = (html: string) => html.replace(/<(ul|ol|li|p)(?![^>]*\bdir=)(?=[\s>])/gi, '<$1 dir="auto"');

/**
 * Stored rich text / plain text value, sanitized; plain text keeps its line breaks. `points` shows
 * plain text as one bullet per sentence, as the legacy COE / scripts cards did.
 */
export function RichBlock({ value, arabic, points }: { value: string; arabic?: boolean; points?: boolean }) {
  const isHtml = /<[a-z][\s\S]*>/i.test(value);
  if (!isHtml && points) {
    const sentences = value.split('.').map((line) => line.trim()).filter(Boolean);
    return (
      <ul className="rich-text hub-text" dir={arabic ? 'rtl' : 'auto'}>
        {sentences.map((line, index) => (
          <li key={index} dir="auto">{line}</li>
        ))}
      </ul>
    );
  }
  return isHtml ? (
    <div className="rich-text hub-text" dir={arabic ? 'rtl' : 'auto'} dangerouslySetInnerHTML={{ __html: autoDirection(sanitizeRichText(value)) }} />
  ) : (
    <div className="hub-text hub-pre" dir={arabic ? 'rtl' : 'auto'}>
      {value}
    </div>
  );
}

/**
 * A field value that may be stored as rich text (HTML) or plain text: HTML is shown formatted
 * (sanitized) instead of as raw tags, plain text as is.
 */
export function RichValue({ value }: { value: string }) {
  if (!/<[a-z][\s\S]*>/i.test(value)) return <>{value}</>;
  return <div className="rich-text rich-value" dangerouslySetInnerHTML={{ __html: autoDirection(sanitizeRichText(value)) }} />;
}

/** Label/value row inside a card (base.css kv-item). */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv-item">
      <span className="k">{label}</span>
      <span className="v" dir="auto">{children}</span>
    </div>
  );
}


/**
 * Loads cached hub data and renders it, with the shared loading / error (+ retry) states.
 * `cacheKey` is the `cached()` key used by the loader, cleared on retry.
 */
export function HubLoad<T>({ cacheKey, loader, label, children }: { cacheKey: string; loader: () => Promise<T>; label: string; children: (data: T) => ReactNode }) {
  const [reload, setReload] = useState(0);
  const data = useAsyncData(`${cacheKey}:${reload}`, loader);
  if (data.loading) return <div className="bento"><HubLoading label={`Loading ${label}…`} /></div>;
  if (data.error || data.data === undefined) {
    return (
      <div className="bento">
        <HubError
          title={`Couldn’t load ${label}`}
          message={data.error ?? ''}
          onRetry={() => {
            clearHubCache(cacheKey);
            setReload((count) => count + 1);
          }}
        />
      </div>
    );
  }
  return <>{children(data.data)}</>;
}

/** Code chip with a copy button (service / package codes are read out on calls). */
export function CopyChip({ value, label = 'code' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = () =>
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      },
      () => undefined,
    );
  return (
    <button type="button" className={`card-code${copied ? ' copied' : ''}`} onClick={copy} title={`Copy ${label}`} aria-label={`Copy ${label} ${value}`}>
      <span dir="ltr">{value}</span>
      {copied ? <TickCircle size={13} color="currentColor" /> : <Copy size={13} color="currentColor" />}
    </button>
  );
}

/** Icon + text line inside a card (business unit, specialty, address…). */
export function MetaItem({ icon, children, title }: { icon: ReactNode; children: ReactNode; title?: string }) {
  return (
    <span className="card-meta-item" title={title}>
      <span className="card-meta-icon" aria-hidden="true">{icon}</span>
      <span dir="auto">{children}</span>
    </span>
  );
}

/** Large price with its currency; `before` is shown struck through. */
export function PriceTag({ value, currency, before, label = 'Price' }: { value: number | string | null; currency: string; before?: number | string | null; label?: string }) {
  const show = (amount: number | string) => (typeof amount === 'number' ? amount.toLocaleString() : amount);
  return (
    <div className="card-price">
      <span className="card-price-label">{label}</span>
      <span className="card-price-values">
        {before !== undefined && before !== null && before !== '' && (
          <s className="card-price-before">
            {show(before)} {currency}
          </s>
        )}
        {value === null || value === '' ? (
          <span className="card-price-amount na">N/A</span>
        ) : (
          <span className="card-price-amount">
            {show(value)} <small>{currency}</small>
          </span>
        )}
      </span>
    </div>
  );
}

export interface CardField {
  label: string;
  value: ReactNode;
  /** Highlight the value (prices). */
  strong?: boolean;
}

/** Labelled fields of a card, in the legacy web resource's order ("CODE: … PRICE: …"). Empty values show N/A. */
export function CardFields({ fields }: { fields: readonly CardField[] }) {
  return (
    <dl className="card-fields">
      {fields.map((field) => (
        <div key={field.label} className="card-field">
          <dt>{field.label}</dt>
          <dd dir="auto" className={field.strong ? 'strong' : undefined}>
            {field.value === '' || field.value === null || field.value === undefined ? (
              'N/A'
            ) : field.strong ? (
              <span className="card-pill">{field.value}</span>
            ) : typeof field.value === 'string' ? (
              <RichValue value={field.value} />
            ) : (
              field.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
