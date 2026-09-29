import { useState } from 'react';
import { CloseCircle, ExportSquare } from 'iconsax-react';
import type { Region } from '../../app/region';
import { clearHubCache, foundText, includesText } from '../../data/hub/common';
import { canEmbed, DEVICE_STATUS, embedUrl, loadCapex, loadDocuments, loadGuidelines, openInNewTab, type CapexItem, type DocumentKind, type HubDocument } from '../../data/hub/library';
import { imageUrl } from '../../data/hub/images';
import { viewableSharePointFile } from '../../data/sharepointFiles';
import { useAsyncData } from '../../data/useAsyncData';
import { SharePointFileViewer } from './SharePointFileViewer';
import { FilterPanel, FilterSelect, HubEmpty, HubError, HubLoading, RichBlock, SearchField } from './HubCommon';

/**
 * Events, Installments, Special Handling, System Links, Other Health Info, CPGs and CAPEX — the
 * legacy "buttons + embedded document" screens.
 */

const isWebUrl = (value: string) => /^https?:\/\//i.test(value.trim());

/** Embedded document with an "open in new tab" fallback (some sites refuse to be framed). */
function DocumentViewer({ doc, onClose }: { doc: HubDocument; onClose: () => void }) {
  // SharePoint files the app can read itself are shown from their content (SharePoint refuses frames).
  const spFile = viewableSharePointFile(doc.url);
  return (
    <div className="bento hub-viewer">
      <div className="hub-viewer-hdr">
        <div className="ro-title" dir="auto">{doc.name}</div>
        <span className="hub-viewer-actions">
          <a className="btn btn-outline btn-sm" href={doc.url} target="_blank" rel="noreferrer">
            <ExportSquare size={14} color="currentColor" /> Open in new tab
          </a>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close document">
            <CloseCircle size={14} color="currentColor" /> Close
          </button>
        </span>
      </div>
      {spFile ? (
        <SharePointFileViewer file={spFile} />
      ) : (
        <>
          <p className="hub-viewer-hint">If the file doesn’t appear below, use “Open in new tab”.</p>
          <iframe className="hub-frame" src={embedUrl(doc.url)} title={doc.name} allow="fullscreen" />
        </>
      )}
    </div>
  );
}

const DOCUMENT_UI: Record<DocumentKind, { icon: string; empty: string; newTab?: boolean }> = {
  events: { icon: '📅', empty: 'No events found' },
  installments: { icon: '💳', empty: 'No installments found' },
  'special-handling': { icon: '🛠️', empty: 'No special handling records found' },
  'system-links': { icon: '🔗', empty: 'No system links found', newTab: true },
  'other-health-info': { icon: '🩺', empty: 'No data found' },
};

/** Buttons (one per document) with the chosen document embedded below, or opened in a new tab. */
export function DocumentPicker({ docs, icon, empty, newTab }: { docs: readonly HubDocument[]; icon: string; empty: string; newTab?: boolean }) {
  const [open, setOpen] = useState<HubDocument | null>(null);
  const usable = docs.filter((doc) => isWebUrl(doc.url));
  if (usable.length === 0) return <div className="bento"><HubEmpty title={empty} sub="Nothing is listed for this region yet." /></div>;
  return (
    <>
      <div className="bento">
        <div className="hub-link-grid">
          {usable.map((doc) =>
            newTab || !canEmbed(doc.url) ? (
              <a key={doc.id} className="hub-link-btn" href={doc.url} target="_blank" rel="noreferrer" title="Opens in a new tab">
                <span aria-hidden="true">{icon}</span>
                <span dir="auto">{doc.name}</span>
                <ExportSquare className="hub-link-ext" size={14} color="currentColor" aria-hidden="true" />
              </a>
            ) : (
              <button key={doc.id} type="button" className={`hub-link-btn${open?.id === doc.id ? ' active' : ''}`} aria-pressed={open?.id === doc.id} onClick={() => setOpen(doc)}>
                <span aria-hidden="true">{icon}</span>
                <span dir="auto">{doc.name}</span>
              </button>
            ),
          )}
        </div>
      </div>
      {open && <DocumentViewer key={open.id} doc={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function DocumentsSection({ region, kind }: { region: Region; kind: DocumentKind }) {
  const [reload, setReload] = useState(0);
  const data = useAsyncData(`docs:${kind}:${region}:${reload}`, () => loadDocuments(kind, region));
  const ui = DOCUMENT_UI[kind];
  const retry = () => {
    clearHubCache(`docs:${kind}:${region}`);
    setReload((count) => count + 1);
  };

  if (data.loading) return <div className="bento"><HubLoading label="Loading…" /></div>;
  if (data.error || !data.data) return <div className="bento"><HubError title="Couldn’t load this page" message={data.error ?? ''} onRetry={retry} /></div>;
  return <DocumentPicker docs={data.data} icon={ui.icon} empty={ui.empty} newTab={ui.newTab} />;
}

// ---- CPGs & Protocols ----

export function GuidelinesSection({ region }: { region: Region }) {
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState({ specialty: '', search: '' });
  const [open, setOpen] = useState<HubDocument | null>(null);
  const data = useAsyncData(`cpgs:${region}:${reload}`, () => loadGuidelines(region));
  const retry = () => {
    clearHubCache(`cpgs:${region}`);
    setReload((count) => count + 1);
  };

  if (data.loading) return <div className="bento"><HubLoading label="Loading CPGs & protocols…" /></div>;
  if (data.error || !data.data) return <div className="bento"><HubError title="Couldn’t load CPGs" message={data.error ?? ''} onRetry={retry} /></div>;
  const list = data.data.guidelines.filter((item) => (!filters.specialty || item.specialtyId === filters.specialty) && includesText([item.name], filters.search));

  return (
    <>
      <FilterPanel summary={foundText(list.length, 'CPG')} canClear={Boolean(filters.specialty || filters.search)} onClear={() => setFilters({ specialty: '', search: '' })}>
        <FilterSelect label="Specialty" allLabel="All" value={filters.specialty} options={data.data.specialties.map((item) => ({ value: item.id, label: item.name }))} onChange={(specialty) => setFilters({ ...filters, specialty })} />
        <SearchField label="Search" value={filters.search} placeholder="Search by name…" onChange={(search) => setFilters({ ...filters, search })} />
      </FilterPanel>
      {open && <DocumentViewer key={open.id} doc={open} onClose={() => setOpen(null)} />}
      {list.length === 0 ? (
        <div className="bento"><HubEmpty title="No CPGs found" sub="Try adjusting your filters" /></div>
      ) : (
        <div className="hub-grid hub-grid-sm">
          {list.map((item) => (
            <button key={item.id} type="button" className={`ro-card hub-card hub-card-btn${open?.id === item.id ? ' hub-card-active' : ''}`} disabled={!isWebUrl(item.url)} onClick={() => (canEmbed(item.url) ? setOpen(item) : openInNewTab(item.url))}>
              <span className="hub-card-title" dir="auto">{item.name}</span>
              <span className="hub-card-meta">Specialty: {item.specialtyName || '—'}</span>
              {open?.id === item.id && <span className="sbadge sbadge-gold">📖 Viewing</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ---- CAPEX ----

export function CapexSection({ region }: { region: Region }) {
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState({ bu: '', specialty: '', search: '' });
  const data = useAsyncData(`capex:${region}:${reload}`, () => loadCapex(region));
  const retry = () => {
    clearHubCache(`capex:${region}`);
    setReload((count) => count + 1);
  };

  if (data.loading) return <div className="bento"><HubLoading label="Loading CAPEX…" /></div>;
  if (data.error || !data.data) return <div className="bento"><HubError title="Couldn’t load CAPEX" message={data.error ?? ''} onRetry={retry} /></div>;

  // KSA (legacy): one button per device document.
  if (region === 'KSA') return <DocumentPicker docs={data.data.items} icon="🧰" empty="No CAPEX items found" />;

  const list = data.data.items.filter(
    (item) => (!filters.bu || item.buId === filters.bu) && (!filters.specialty || item.specialtyId === filters.specialty) && includesText([item.name], filters.search),
  );
  return (
    <>
      <FilterPanel summary={foundText(list.length, 'device')} canClear={Boolean(filters.bu || filters.specialty || filters.search)} onClear={() => setFilters({ bu: '', specialty: '', search: '' })}>
        <FilterSelect label="Business Unit" allLabel="All" value={filters.bu} options={data.data.bus.map((bu) => ({ value: bu.id, label: bu.name }))} onChange={(bu) => setFilters({ ...filters, bu })} />
        <FilterSelect label="Specialty" allLabel="All" value={filters.specialty} options={data.data.specialties.map((item) => ({ value: item.id, label: item.name }))} onChange={(specialty) => setFilters({ ...filters, specialty })} />
        <SearchField label="Search" value={filters.search} placeholder="Search by device name…" onChange={(search) => setFilters({ ...filters, search })} />
      </FilterPanel>
      {list.length === 0 ? (
        <div className="bento"><HubEmpty title="No CAPEX items found" sub="Try adjusting your filters" /></div>
      ) : (
        <div className="hub-grid">
          {list.map((item) => (
            <CapexCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}

function CapexCard({ item }: { item: CapexItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const status = item.status !== null ? DEVICE_STATUS[item.status] : undefined;
  return (
    <article className="ro-card hub-card">
      <div className="hub-card-tags">{status ? <span className={`sbadge ${status.badge}`}>{status.label}</span> : <span className="sbadge sbadge-gray">—</span>}</div>
      {imageUrl(item.imageUrl) && !imageFailed && <img className="hub-photo" src={imageUrl(item.imageUrl) ?? ''} alt={item.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />}
      <h3 className="hub-card-title" dir="auto">{item.name}</h3>
      <div className="hub-card-meta">Specialty: {item.specialtyName || '—'} | BU: {item.buName || '—'}</div>
      {item.descriptionEn && <div className="hub-subblock"><RichBlock value={item.descriptionEn} /></div>}
      {item.descriptionAr && <div className="hub-subblock"><RichBlock value={item.descriptionAr} arabic /></div>}
      {isWebUrl(item.url) && (
        <a className="btn btn-outline btn-sm hub-card-action hub-gap" href={item.url} target="_blank" rel="noreferrer">
          <ExportSquare size={14} color="currentColor" /> Open document
        </a>
      )}
    </article>
  );
}
