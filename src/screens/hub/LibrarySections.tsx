import { useState } from 'react';
import { ExportSquare } from 'iconsax-react';
import type { Region } from '../../app/region';
import { clearHubCache, foundText, includesText } from '../../data/hub/common';
import { DEVICE_STATUS, loadCapex, loadDocuments, loadGuidelines, type CapexItem, type DocumentKind, type HubDocument } from '../../data/hub/library';
import { imageUrl } from '../../data/hub/images';
import { openInPopup, openLink } from '../../data/fileLinks';
import { useAsyncData } from '../../data/useAsyncData';
import { FilterPanel, FilterSelect, HubEmpty, HubError, HubLoading, RichBlock, SearchField } from './HubCommon';

/**
 * Events, Installments, Special Handling, System Links, Other Health Info, CPGs and CAPEX — the
 * legacy "buttons + embedded document" screens. The code app can't frame other sites (its CSP and
 * SharePoint's frame-ancestors), so documents open in the pop-up window; system links in a new tab.
 */

const isWebUrl = (value: string) => /^https?:\/\//i.test(value.trim());

const DOCUMENT_UI: Record<DocumentKind, { icon: string; empty: string; newTab?: boolean }> = {
  events: { icon: '📅', empty: 'No events found' },
  installments: { icon: '💳', empty: 'No installments found' },
  'special-handling': { icon: '🛠️', empty: 'No special handling records found' },
  'system-links': { icon: '🔗', empty: 'No system links found', newTab: true },
  'other-health-info': { icon: '🩺', empty: 'No data found' },
};

/**
 * Legacy flow: a section of buttons, one per record; a click shows the record's link. The legacy page
 * set an iframe's src; here the link opens in the pop-up window (system links: a new tab, as before).
 */
export function DocumentPicker({ docs, icon, empty, newTab }: { docs: readonly HubDocument[]; icon: string; empty: string; newTab?: boolean }) {
  const [last, setLast] = useState('');
  // Every record gets its button, as in the legacy page; one without a link shows disabled.
  const listed = docs.filter((doc) => doc.name || isWebUrl(doc.url));
  if (listed.length === 0) return <div className="bento"><HubEmpty title={empty} sub="Nothing is listed for this region yet." /></div>;
  return (
    <div className="bento">
      <div className="hub-link-grid">
        {listed.map((doc) =>
          !isWebUrl(doc.url) ? (
            <button key={doc.id} type="button" className="hub-link-btn" disabled title="No link added yet (Iframe URL is empty)">
              <span aria-hidden="true">{icon}</span>
              <span dir="auto">{doc.name}</span>
              <span className="hub-link-missing">No link yet</span>
            </button>
          ) : (
            <button
              key={doc.id}
              type="button"
              className={`hub-link-btn${last === doc.id ? ' active' : ''}`}
              onClick={() => {
                setLast(doc.id);
                openLink(doc.url.trim(), doc.name, newTab);
              }}
            >
              <span aria-hidden="true">{icon}</span>
              <span dir="auto">{doc.name}</span>
              {newTab && <ExportSquare className="hub-link-ext" size={14} color="currentColor" aria-hidden="true" />}
            </button>
          ),
        )}
      </div>
    </div>
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
  const [last, setLast] = useState('');
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
      {list.length === 0 ? (
        <div className="bento"><HubEmpty title="No CPGs found" sub="Try adjusting your filters" /></div>
      ) : (
        <div className="hub-grid hub-grid-sm">
          {/* Legacy: clicking a CPG card marks it active and shows its link (now in the pop-up window). */}
          {list.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`ro-card hub-card hub-card-btn${last === item.id ? ' hub-card-active' : ''}`}
              disabled={!isWebUrl(item.url)}
              onClick={() => {
                setLast(item.id);
                openInPopup(item.url.trim(), item.name);
              }}
            >
              <span className="hub-card-title" dir="auto">{item.name}</span>
              <span className="hub-card-meta">Specialty: {item.specialtyName || '—'}</span>
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
    </article>
  );
}
