import { useState } from 'react';
import { REGION_CURRENCY, type Region } from '../../app/region';
import { clearHubCache, foundText } from '../../data/hub/common';
import { loadServiceLookups, queryServices, type ServiceItem, type ServiceKind, type ServiceLookups } from '../../data/hub/services';
import { useAsyncData } from '../../data/useAsyncData';
import { Box, Health, Microscope, Scan, Scissor } from 'iconsax-react';
import { CopyChip, FilterPanel, FilterSelect, HubEmpty, HubError, HubLoading, SearchField } from './HubCommon';
import { useDebounced } from './useDebounced';
import { usePagedQuery } from './usePagedQuery';

/** Legacy "Andalusia Services" / "Andalusia Packages" screens (same table, split by category). */

interface ServiceFilters {
  buId: string;
  specialtyId: string;
  categoryId: string;
  search: string;
}

const NO_FILTERS: ServiceFilters = { buId: '', specialtyId: '', categoryId: '', search: '' };

const NOUN: Record<ServiceKind, string> = { services: 'service', packages: 'package' };

export function ServicesSection({ region, kind, initialSpecialtyId = '' }: { region: Region; kind: ServiceKind; initialSpecialtyId?: string }) {
  const [reload, setReload] = useState(0);
  const lookups = useAsyncData(`service-lookups:${region}:${reload}`, () => loadServiceLookups(region));
  const retry = () => {
    clearHubCache(`service-lookups:${region}`);
    setReload((count) => count + 1);
  };

  if (lookups.loading) return <div className="bento"><HubLoading label={`Loading ${kind}…`} /></div>;
  if (lookups.error || !lookups.data) return <div className="bento"><HubError title={`Couldn’t load ${kind}`} message={lookups.error ?? ''} onRetry={retry} /></div>;
  return <ServicesList region={region} kind={kind} lookups={lookups.data} initialSpecialtyId={initialSpecialtyId} />;
}

function ServicesList({ region, kind, lookups, initialSpecialtyId }: { region: Region; kind: ServiceKind; lookups: ServiceLookups; initialSpecialtyId: string }) {
  const [filters, setFilters] = useState<ServiceFilters>({ ...NO_FILTERS, specialtyId: initialSpecialtyId });
  const [attempt, setAttempt] = useState(0);
  const search = useDebounced(filters.search);
  const query = { kind, region, buId: filters.buId, specialtyId: filters.specialtyId, categoryId: filters.categoryId, search, sort: 'none' as const };
  const results = usePagedQuery(JSON.stringify({ ...query, attempt }), (page) => queryServices({ ...query, page }, lookups));
  const set = <K extends keyof ServiceFilters>(key: K, value: ServiceFilters[K]) => setFilters((prev) => ({ ...prev, [key]: value }));
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  const buName = new Map(lookups.bus.map((bu) => [bu.id, bu.name]));
  const specialtyName = new Map(lookups.allSpecialties.map((specialty) => [specialty.id, specialty.name]));
  const categoryName = new Map(lookups.categories.map((category) => [category.id, category.name]));
  const categories = lookups.categories.filter((category) => category.id !== lookups.packageCategoryId);
  // Dataverse reports exact totals below 5000; above that only "more records" is known.
  const exactTotal = results.total !== null && results.total >= 0 && results.total < 5000 ? results.total : null;
  const summary = results.loading
    ? ''
    : exactTotal !== null
      ? foundText(exactTotal, NOUN[kind])
      : results.more
        ? `Showing ${results.items.length} ${NOUN[kind]}s — more available`
        : foundText(results.items.length, NOUN[kind]);

  return (
    <>
      <FilterPanel summary={summary} canClear={hasFilters} onClear={() => setFilters(NO_FILTERS)}>
        <FilterSelect label="Business Unit" allLabel="All Business Units" value={filters.buId} options={lookups.bus.map((bu) => ({ value: bu.id, label: bu.name }))} onChange={(value) => set('buId', value)} />
        <FilterSelect label="Specialty" allLabel="All Specialties" value={filters.specialtyId} options={lookups.specialties.map((specialty) => ({ value: specialty.id, label: specialty.name }))} onChange={(value) => set('specialtyId', value)} />
        {kind === 'services' && (
          <FilterSelect label="Category" allLabel="All Categories" value={filters.categoryId} options={categories.map((category) => ({ value: category.id, label: category.name }))} onChange={(value) => set('categoryId', value)} />
        )}
        <SearchField label={kind === 'services' ? 'Search Services' : 'Search Packages'} value={filters.search} placeholder="Search by name (Arabic/English) or code…" onChange={(value) => set('search', value)} />
      </FilterPanel>

      {results.loading ? (
        <div className="bento"><HubLoading label={`Loading ${kind}…`} /></div>
      ) : results.error && results.items.length === 0 ? (
        <div className="bento"><HubError title={`Couldn’t load ${kind}`} message={results.error} onRetry={() => setAttempt((value) => value + 1)} /></div>
      ) : results.items.length === 0 ? (
        <div className="bento"><HubEmpty title={`No ${kind} found`} sub="Try adjusting your filters" /></div>
      ) : (
        <>
          <div className="hub-grid">
            {results.items.map((item) => (
              <ServiceCard key={item.id} kind={kind} item={item} currency={REGION_CURRENCY[region]} buName={buName.get(item.buId) || item.buLabel} specialtyName={specialtyName.get(item.specialtyId) || item.specialtyLabel} categoryName={kind === 'services' ? categoryName.get(item.categoryId) || item.categoryLabel : undefined} />
            ))}
          </div>
          {results.error && <div className="hub-count-note field-err" role="alert">{results.error}</div>}
          {results.more && (
            <div className="hub-more">
              <button type="button" className="btn btn-outline" disabled={results.loadingMore} onClick={results.loadMore}>
                {results.loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Icon for a service category (by name, so new categories fall back to a generic one). */
function categoryIcon(category: string, kind: ServiceKind) {
  const name = category.toLowerCase();
  const props = { size: 22, color: 'currentColor', variant: 'Bulk' as const };
  if (kind === 'packages' || name.includes('package')) return <Box {...props} />;
  if (name.includes('radio') || name.includes('scan') || name.includes('x-ray') || name.includes('mri')) return <Scan {...props} />;
  if (name.includes('lab')) return <Microscope {...props} />;
  if (name.includes('proced') || name.includes('surg')) return <Scissor {...props} />;
  return <Health {...props} />;
}

function ServiceCard({ kind, item, currency, buName, specialtyName, categoryName }: { kind: ServiceKind; item: ServiceItem; currency: string; buName?: string; specialtyName?: string; categoryName?: string }) {
  // Legacy fields, all labelled: Code, Price, Business Unit, Specialty, Category.
  const na = (value?: string) => value || 'N/A';
  return (
    <article className="ro-card hub-card svc-card">
      <header className="svc-head">
        <span className="svc-icon" aria-hidden="true">{categoryIcon(categoryName ?? '', kind)}</span>
        <span className="svc-head-text">
          <span className="svc-kind">{kind === 'packages' ? 'Package' : categoryName || 'Service'}</span>
          <h3 className="svc-title" dir="auto" title={item.name}>
            {item.name || 'N/A'}
          </h3>
        </span>
      </header>
      {item.nameAr && (
        <div className="svc-ar" dir="rtl" title={item.nameAr}>
          {item.nameAr}
        </div>
      )}
      <dl className="svc-grid">
        <div className="svc-f wide">
          <dt>Code</dt>
          <dd>{item.code ? <CopyChip value={item.code} /> : 'N/A'}</dd>
        </div>
        <div className="svc-f">
          <dt>Business Unit</dt>
          <dd dir="auto">{na(buName)}</dd>
        </div>
        <div className="svc-f">
          <dt>Specialty</dt>
          <dd dir="auto">{na(specialtyName)}</dd>
        </div>
        {categoryName !== undefined && (
          <div className="svc-f wide">
            <dt>Category</dt>
            <dd dir="auto">{na(categoryName)}</dd>
          </div>
        )}
      </dl>
      <div className="svc-price">
        <span className="svc-price-label">Price</span>
        {item.price === null ? (
          <span className="svc-price-amount na">N/A</span>
        ) : (
          <span className="svc-price-amount">
            {item.price.toLocaleString()} <small>{currency}</small>
          </span>
        )}
      </div>
    </article>
  );
}
